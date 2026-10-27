from app.utils.vnc import get_vnc_port
from app.utils.auth import decode_access_token, user_has_policy
from app.services.gliss import web_dir
from app.services.desktop_stream import local_stream, slave_stream, relay_stream
from app.services.vm_service import VmService
from app.orm.user import UserORM
from app.core.config import engine, VNC_HOST
from sqlmodel import Session
import asyncio
import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from importlib.metadata import version
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query, WebSocket
from fastapi.responses import FileResponse, JSONResponse

logger = logging.getLogger(__name__)

# Browsers and proxies cache the gliss modules, so each gliss-server version
# gets its own URLs and an upgrade never reuses an old client.
GLISS_VERSION = version("gliss-server")


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
        upstream = slave_stream(slave, resolved_vm_id)
    else:
        try:
            vnc_port = await asyncio.to_thread(get_vnc_port, resolved_vm_id)
        except Exception as exc:
            detail = getattr(exc, "detail", str(exc))
            await websocket.close(code=4002, reason=detail)
            return
        upstream = local_stream(VNC_HOST, vnc_port)

    logger.info("Tunnel: vm_id=%s host=%s",
                resolved_vm_id, slave.hostname if slave else VNC_HOST)

    with _resize_owner(resolved_vm_id, viewer or uuid4().hex) as resize:
        await relay_stream(websocket, upstream, resize=resize)


@router.get("/gliss/version")
async def gliss_version() -> JSONResponse:
    """The installed gliss-server version, which names its module URLs."""
    return JSONResponse({"version": GLISS_VERSION}, headers={"Cache-Control": "no-store"})


@router.get("/gliss/versions/{gliss_version}/{path:path}")
async def gliss_versioned_module(gliss_version: str, path: str) -> FileResponse:
    """Serve modules under a URL that changes with every gliss-server upgrade."""
    if gliss_version != GLISS_VERSION:
        raise HTTPException(status_code=404)
    return await gliss_file(path, "public, max-age=31536000, immutable")


@router.get("/gliss/{path:path}")
async def gliss_module(path: str) -> FileResponse:
    """Serve the browser modules matching the installed gliss-server."""
    return await gliss_file(path, "no-cache")


async def gliss_file(path: str, cache_control: str) -> FileResponse:
    directory = await asyncio.to_thread(web_dir)
    file = (directory / path).resolve()
    if not file.is_relative_to(directory.resolve()) or not file.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(file, media_type="text/javascript" if file.suffix == ".js" else None,
                        headers={"Cache-Control": cache_control})
