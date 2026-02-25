import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket

logger = logging.getLogger(__name__)
from sqlmodel import Session, select

from app.core.config import engine, GUACD_HOST, GUACD_PORT, VNC_HOST
from app.orm.vm_credential import VmCredentialORM
from app.services.guacamole import guacd_handshake
from app.utils.crypto import decrypt_secret
from app.utils.vnc import get_vnc_port

router = APIRouter()


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

    # 4. Connect to guacd
    try:
        reader, writer = await asyncio.open_connection(GUACD_HOST, GUACD_PORT)
    except Exception as e:
        await websocket.close(code=1011, reason=f"Cannot connect to guacd: {e}")
        return

    # 5. Handshake
    try:
        await guacd_handshake(
            reader, writer, vnc_host=VNC_HOST, vnc_port=vnc_port
        )
    except Exception as e:
        writer.close()
        await websocket.close(code=1011, reason=str(e))
        return

    # 6. Bidirectional relay
    async def browser_to_guacd():
        try:
            async for msg in websocket.iter_text():
                # guacamole-common-js sends internal keepalive/ping messages
                # using INTERNAL_DATA_OPCODE (empty string opcode, encoded as
                # "0.,4.ping,TIMESTAMP;"). guacd cannot handle empty-opcode
                # instructions and closes the connection. Echo them back to
                # the browser so its receive timer stays alive, but don't
                # forward to guacd.
                try:
                    first_dot = msg.index(".")
                    if int(msg[:first_dot]) == 0:
                        await websocket.send_text(msg)
                        continue
                except (ValueError, IndexError):
                    pass
                writer.write(msg.encode())
                await writer.drain()
        except Exception:
            pass
        finally:
            writer.close()

    async def guacd_to_browser():
        try:
            while chunk := await reader.read(65536):
                await websocket.send_text(chunk.decode())
        except Exception:
            pass
        finally:
            try:
                await websocket.close()
            except Exception:
                pass

    await asyncio.gather(
        browser_to_guacd(), guacd_to_browser(), return_exceptions=True
    )
