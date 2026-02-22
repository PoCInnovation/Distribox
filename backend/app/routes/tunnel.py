import asyncio

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from app.core.config import engine, GUACD_HOST, GUACD_PORT
from app.orm.vm_credential import VmCredentialORM
from app.services.guacamole import guacd_handshake
from app.utils.crypto import decrypt_secret
from app.utils.vnc import get_vnc_port

router = APIRouter()


def _find_vm_for_credential(password: str) -> str | None:
    """Scan credentials table and return vm_id if the password matches."""
    with Session(engine) as session:
        credentials = session.exec(select(VmCredentialORM)).all()
        for cred in credentials:
            try:
                if decrypt_secret(cred.password) == password:
                    return str(cred.vm_id)
            except Exception:
                continue
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
        await websocket.close(code=4001, reason="Invalid credential")
        return

    # 2. VNC port discovery (sync → thread pool)
    try:
        vnc_port = await asyncio.to_thread(get_vnc_port, vm_id)
    except Exception as exc:
        detail = getattr(exc, "detail", str(exc))
        await websocket.close(code=4002, reason=detail)
        return

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
            reader, writer, vnc_host="127.0.0.1", vnc_port=vnc_port
        )
    except Exception as e:
        writer.close()
        await websocket.close(code=1011, reason=str(e))
        return

    # 6. Bidirectional relay
    async def browser_to_guacd():
        try:
            async for msg in websocket.iter_text():
                writer.write(msg.encode())
                await writer.drain()
        except WebSocketDisconnect:
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
            await websocket.close()

    await asyncio.gather(
        browser_to_guacd(), guacd_to_browser(), return_exceptions=True
    )
