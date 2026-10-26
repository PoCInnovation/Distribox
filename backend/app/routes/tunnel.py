from app.utils.vnc import get_vnc_port
from app.utils.auth import decode_access_token, user_has_policy
from app.services.gliss import gliss_session, web_dir
from app.services.vm_service import VmService
from app.orm.user import UserORM
from app.core.config import engine, VNC_HOST
from sqlmodel import Session
import asyncio
import json
import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from websockets.asyncio.client import connect

logger = logging.getLogger(__name__)


router = APIRouter()

# The viewer allowed to resize each VM's guest, its number of open tunnels and
# when its last tunnel closed. Other viewers, such as an admin opening a
# student's VM, keep the guest's size.
_resize_owners: dict[str, tuple[str, int, float]] = {}
# Time an owner without open tunnels keeps ownership, longer than the client's
# reconnect backoff so that it wins when every viewer reconnects at once.
RESIZE_OWNER_GRACE_S = 60


@contextmanager
def _resize_owner(vm_id: str, viewer: str) -> Iterator[bool]:
    """Yield whether this viewer may resize the guest for the tunnel's lifetime.

    Ownership follows the viewer rather than the tunnel, so a client that
    reconnects while its stale tunnel is still open keeps it.
    """
    owner, tunnels, closed_at = _resize_owners.get(vm_id, (viewer, 0, 0.0))
    if owner != viewer:
        if tunnels or time.monotonic() - closed_at < RESIZE_OWNER_GRACE_S:
            yield False
            return
        tunnels = 0
    _resize_owners[vm_id] = (viewer, tunnels + 1, 0.0)
    try:
        yield True
    finally:
        owner, tunnels, _ = _resize_owners[vm_id]
        _resize_owners[vm_id] = (owner, tunnels - 1, time.monotonic())


def _is_resize(message: str) -> bool:
    try:
        decoded = json.loads(message)
    except ValueError:
        return False
    return isinstance(decoded, dict) and decoded.get("type") == "resize"


def _find_vm_for_credential(token: str) -> str | None:
    from app.services.ssh_access import find_credential

    with Session(engine) as session:
        credential = find_credential(session, token)
        return str(credential.vm_id) if credential else None


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
    viewer: str | None = Query(default=None),
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
        vnc_host = slave.hostname
    else:
        try:
            vnc_port = await asyncio.to_thread(get_vnc_port, resolved_vm_id)
        except Exception as exc:
            detail = getattr(exc, "detail", str(exc))
            await websocket.close(code=4002, reason=detail)
            return
        vnc_host = VNC_HOST

    logger.info("Tunnel: vm_id=%s vnc=%s:%s",
                resolved_vm_id, vnc_host, vnc_port)

    with _resize_owner(resolved_vm_id, viewer or uuid4().hex) as resize:
        await _relay(websocket, vnc_host, vnc_port, resize)


async def _relay(websocket: WebSocket, vnc_host: str, vnc_port: int,
                 resize: bool) -> None:
    await websocket.accept()
    try:
        async with gliss_session(vnc_host, vnc_port) as (url, headers), \
                connect(url, additional_headers=headers, max_size=None) as gliss:

            async def browser_to_gliss():
                async for message in websocket.iter_text():
                    if resize or not _is_resize(message):
                        await gliss.send(message)

            async def gliss_to_browser():
                async for message in gliss:
                    if isinstance(message, bytes):
                        await websocket.send_bytes(message)
                    else:
                        await websocket.send_text(message)

            relays = [asyncio.create_task(browser_to_gliss()),
                      asyncio.create_task(gliss_to_browser())]
            done, pending = await asyncio.wait(
                relays, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                task.result()
    except WebSocketDisconnect:
        return
    except Exception as exc:
        logger.warning("Tunnel to VNC %s:%s failed: %s",
                       vnc_host, vnc_port, exc)
        reason = "Cannot stream the VM desktop"
    else:
        reason = "The VM desktop stream ended"
    try:
        await websocket.close(code=1011, reason=reason)
    except Exception:
        pass


@router.get("/gliss/{path:path}")
async def gliss_module(path: str) -> FileResponse:
    """Serve the browser modules matching the installed gliss-server."""
    directory = await asyncio.to_thread(web_dir)
    file = (directory / path).resolve()
    if not file.is_relative_to(directory.resolve()) or not file.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(file, media_type="text/javascript" if file.suffix == ".js" else None)
