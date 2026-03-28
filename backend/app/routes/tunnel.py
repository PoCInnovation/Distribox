from app.utils.vnc import get_vnc_port
from app.utils.crypto import decrypt_secret
from app.utils.auth import decode_access_token, user_has_policy
from app.services.guacamole import build_instruction, guacd_handshake, read_instruction
from app.services.vm_service import VmService
from app.orm.vm_credential import VmCredentialORM
from app.orm.user import UserORM
from app.core.config import engine, GUACD_HOST, GUACD_PORT, VNC_HOST
from sqlmodel import Session, select
import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


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

    Returns None if the credential is expired or not found.
    """
    from datetime import datetime

    normalized = token.strip()
    if not normalized:
        return None

    with Session(engine) as session:
        credentials = session.exec(
            select(VmCredentialORM.id, VmCredentialORM.vm_id,
                   VmCredentialORM.password, VmCredentialORM.expires_at)
        ).all()

        for cred in credentials:
            try:
                if decrypt_secret(cred.password) == normalized:
                    if cred.expires_at and datetime.utcnow() > cred.expires_at:
                        return None
                    return str(cred.vm_id)
            except Exception:
                continue

        try:
            parsed_id = UUID(normalized)
        except ValueError:
            return None

        credential = session.get(VmCredentialORM, parsed_id)
        if credential:
            if credential.expires_at and datetime.now() > credential.expires_at:
                return None
            return str(credential.vm_id)
    return None


def _resolve_vm_id_with_token(vm_id: str, jwt_token: str) -> str | None:
    """
    Validate a JWT token and check that the user has the vms:connect policy.
    Returns the vm_id string if authorized, None otherwise.
    """
    payload = decode_access_token(jwt_token)
    if payload is None:
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    with Session(engine) as session:
        user = session.get(UserORM, user_id)
        if user is None:
            return None
        if not user_has_policy(user, "vms:connect"):
            return None

    # Validate that vm_id is a valid UUID format
    try:
        UUID(vm_id)
    except ValueError:
        return None

    return vm_id


@router.websocket("/tunnel")
async def vm_tunnel(
    websocket: WebSocket,
    credential: str | None = Query(default=None),
    vm_id: str | None = Query(default=None),
    token: str | None = Query(default=None),
    width: int = Query(default=1920),
    height: int = Query(default=1080),
):
    # Resolve VM ID from either credential or vm_id+token
    resolved_vm_id: str | None = None

    if credential:
        resolved_vm_id = await asyncio.to_thread(_find_vm_for_credential, credential)
        if not resolved_vm_id:
            logger.warning("Tunnel rejected: unknown credential token")
            await websocket.close(code=4001, reason="Invalid credential")
            return
    elif vm_id and token:
        resolved_vm_id = await asyncio.to_thread(_resolve_vm_id_with_token, vm_id, token)
        if not resolved_vm_id:
            logger.warning(
                "Tunnel rejected: invalid token or missing vms:connect policy")
            await websocket.close(code=4003, reason="Unauthorized")
            return
    else:
        await websocket.close(code=4001, reason="Provide credential or vm_id+token")
        return

    slave = await asyncio.to_thread(VmService._get_slave_for_vm, resolved_vm_id)

    if slave:
        from app.services.slave_client import slave_get_vnc_port
        try:
            vnc_port = await asyncio.to_thread(slave_get_vnc_port, slave, resolved_vm_id)
        except Exception as exc:
            detail = getattr(exc, "detail", str(exc))
            await websocket.close(code=4002, reason=detail)
            return
        guacd_host = slave.hostname
        guacd_port = GUACD_PORT
        vnc_host = VNC_HOST
    else:
        try:
            vnc_port = await asyncio.to_thread(get_vnc_port, resolved_vm_id)
        except Exception as exc:
            detail = getattr(exc, "detail", str(exc))
            await websocket.close(code=4002, reason=detail)
            return
        guacd_host = GUACD_HOST
        guacd_port = GUACD_PORT
        vnc_host = VNC_HOST

    logger.warning(
        "Tunnel: vm_id=%s vnc=%s:%s guacd=%s:%s slave=%s",
        resolved_vm_id, vnc_host, vnc_port, guacd_host, guacd_port,
        slave.hostname if slave else None,
    )

    await websocket.accept(subprotocol="guacamole")

    try:
        reader, writer = await asyncio.open_connection(guacd_host, guacd_port)
    except Exception as exc:
        await websocket.close(
            code=1011,
            reason=f"Cannot connect to guacd {guacd_host}:{guacd_port}: {exc}",
        )
        return

    try:
        first_instruction = await guacd_handshake(
            reader,
            writer,
            vnc_host=vnc_host,
            vnc_port=vnc_port,
            width=width,
            height=height,
        )
        logger.warning(
            "Tunnel connected via vnc host=%s port=%s",
            vnc_host,
            vnc_port,
        )
    except Exception as exc:
        logger.warning(
            "Tunnel VNC connect failed for host=%s port=%s: %s",
            vnc_host,
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

    ws_send_lock = asyncio.Lock()
    browser_opcode_logs_remaining = 40

    async def send_ws_text(message: str) -> None:
        async with ws_send_lock:
            await websocket.send_text(message)

    async def browser_to_guacd():
        nonlocal browser_opcode_logs_remaining
        try:
            async for msg in websocket.iter_text():
                if _is_internal_instruction(msg):
                    await send_ws_text(msg)
                    continue
                opcode = _extract_opcode(msg)
                if browser_opcode_logs_remaining > 0:
                    logger.warning(
                        "Tunnel browser->guacd opcode=%s size=%s",
                        opcode,
                        len(msg),
                    )
                    browser_opcode_logs_remaining -= 1
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
                logger.warning(
                    "Tunnel initial guacd->browser opcode=%s", initial_opcode)
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
