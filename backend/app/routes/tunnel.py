import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
from sqlmodel import Session, select

from app.core.config import engine, GUACD_HOST, GUACD_PORT, VNC_HOST
from app.orm.vm_credential import VmCredentialORM
from app.services.guacamole import build_instruction, guacd_handshake, read_instruction
from app.utils.crypto import decrypt_secret
from app.utils.vnc import get_vnc_port

router = APIRouter()


def _is_internal_instruction(message: str) -> bool:
    """
    Detect INTERNAL_DATA_OPCODE instructions (empty opcode, encoded as "0.,...;").
    guacamole-common-js sends exactly one instruction per WebSocket message.
    """
    try:
        first_dot = message.index(".")
        return int(message[:first_dot]) == 0
    except (ValueError, IndexError):
        return False


def _extract_opcode(message: str) -> str | None:
    """Extract first Guacamole opcode from a single-instruction message."""
    try:
        first_dot = message.index(".")
        opcode_len = int(message[:first_dot])
        start = first_dot + 1
        end = start + opcode_len
        return message[start:end]
    except (ValueError, IndexError):
        return None


def _find_vm_for_credential(token: str) -> str | None:
    """
    Resolve a public tunnel credential to its VM id.

    Supported token formats:
    - credential password (legacy/current behaviour)
    - credential record UUID (fallback for clients using credential id)
    """
    normalized = token.strip()
    if not normalized:
        return None

    with Session(engine) as session:
        credentials = session.exec(
            select(VmCredentialORM.id, VmCredentialORM.vm_id, VmCredentialORM.password)
        ).all()

        # First, preserve existing semantics: direct password lookup.
        for cred in credentials:
            try:
                if decrypt_secret(cred.password) == normalized:
                    return str(cred.vm_id)
            except Exception:
                continue

        # Fallback: allow UUID credential-id tokens as well.
        try:
            parsed_id = UUID(normalized)
        except ValueError:
            return None

        credential = session.get(VmCredentialORM, parsed_id)
        if credential:
            return str(credential.vm_id)
    return None


@router.websocket("/tunnel")
async def vm_tunnel(
    websocket: WebSocket,
    credential: str = Query(...),
    width: int = Query(default=1024),
    height: int = Query(default=768),
):
    # 1. Credential lookup (sync → thread pool)
    vm_id = await asyncio.to_thread(_find_vm_for_credential, credential)
    if not vm_id:
        logger.warning("Tunnel rejected: unknown credential token")
        await websocket.close(code=4001, reason="Invalid credential")
        return

    # 2. VNC port discovery (sync → thread pool)
    try:
        vnc_port = await asyncio.to_thread(get_vnc_port, vm_id)
    except Exception as exc:
        detail = getattr(exc, "detail", str(exc))
        await websocket.close(code=4002, reason=detail)
        return

    logger.warning(
        "Tunnel: vm_id=%s vnc=%s:%s guacd=%s:%s",
        vm_id, VNC_HOST, vnc_port, GUACD_HOST, GUACD_PORT,
    )

    # 3. Accept WebSocket with guacamole subprotocol
    await websocket.accept(subprotocol="guacamole")

    # 4. Connect to guacd using configured VNC_HOST only.
    try:
        reader, writer = await asyncio.open_connection(GUACD_HOST, GUACD_PORT)
    except Exception as exc:
        await websocket.close(
            code=1011,
            reason=f"Cannot connect to guacd {GUACD_HOST}:{GUACD_PORT}: {exc}",
        )
        return

    try:
        first_instruction = await guacd_handshake(
            reader,
            writer,
            vnc_host=VNC_HOST,
            vnc_port=vnc_port,
        )
        logger.warning(
            "Tunnel connected via configured vnc host=%s port=%s",
            VNC_HOST,
            vnc_port,
        )
    except Exception as exc:
        logger.warning(
            "Tunnel VNC connect failed for configured host=%s port=%s: %s",
            VNC_HOST,
            vnc_port,
            exc,
        )
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        await websocket.close(code=1011, reason=str(exc))
        return

    # 6. Bidirectional relay
    ws_send_lock = asyncio.Lock()

    async def send_ws_text(message: str) -> None:
        async with ws_send_lock:
            await websocket.send_text(message)

    async def browser_to_guacd():
        try:
            async for msg in websocket.iter_text():
                if _is_internal_instruction(msg):
                    # Echo tunnel ping instructions back to keep browser-side
                    # stability checks satisfied. guacd cannot process these.
                    await send_ws_text(msg)
                    continue
                opcode = _extract_opcode(msg)
                if opcode in {"disconnect", "error"}:
                    logger.warning("Tunnel browser->guacd opcode=%s", opcode)
                writer.write(msg.encode())
                await writer.drain()
        except WebSocketDisconnect as exc:
            logger.warning(
                "Tunnel browser_to_guacd websocket disconnected code=%s",
                exc.code,
            )
        except Exception:
            logger.exception("Tunnel browser_to_guacd relay failed")
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    async def guacd_to_browser():
        try:
            if first_instruction:
                initial_opcode = _extract_opcode(first_instruction)
                logger.warning("Tunnel initial guacd->browser opcode=%s", initial_opcode)
                await send_ws_text(first_instruction)
            while True:
                instruction = await read_instruction(reader)
                encoded = build_instruction(*instruction)
                opcode = instruction[0] if instruction else None
                if opcode in {"disconnect", "error"}:
                    logger.warning("Tunnel guacd->browser opcode=%s", opcode)
                await send_ws_text(encoded)
        except ConnectionError:
            logger.warning("Tunnel guacd_to_browser EOF from guacd")
        except WebSocketDisconnect as exc:
            logger.warning(
                "Tunnel guacd_to_browser websocket disconnected code=%s",
                exc.code,
            )
        except Exception:
            logger.exception("Tunnel guacd_to_browser relay failed")
        finally:
            try:
                await websocket.close()
            except Exception:
                pass

    await asyncio.gather(
        browser_to_guacd(), guacd_to_browser(), return_exceptions=True
    )
