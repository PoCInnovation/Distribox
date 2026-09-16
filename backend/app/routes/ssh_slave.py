import asyncio
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, Response, WebSocket, WebSocketDisconnect

from app.core.config import SLAVE_API_KEY
from app.services.ssh_guest import prepare_guest, resolve_guest_target
from app.utils.slave_auth import require_slave_token

router = APIRouter()


@router.post("/vms/{vm_id}/ssh/prepare", dependencies=[Depends(require_slave_token)])
def prepare_vm_ssh(vm_id: UUID, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return prepare_guest(str(vm_id))


@router.websocket("/vms/{vm_id}/ssh/tunnel")
async def relay_vm_ssh(websocket: WebSocket, vm_id: UUID):
    token = websocket.headers.get("x-slave-token", "")
    if not SLAVE_API_KEY or not secrets.compare_digest(token.encode(), SLAVE_API_KEY.encode()):
        await websocket.close(code=1008)
        return
    try:
        host = await asyncio.to_thread(resolve_guest_target, str(vm_id))
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, 22), 10)
    except Exception:
        await websocket.close(code=1011)
        return

    async def send():
        while data := await reader.read(65536):
            await websocket.send_bytes(data)

    async def receive():
        async for data in websocket.iter_bytes():
            if len(data) > 65536:
                raise ValueError("SSH relay message is too large")
            writer.write(data)
            await writer.drain()

    tasks = []
    try:
        await websocket.accept()
        tasks = [asyncio.create_task(send()), asyncio.create_task(receive())]
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        writer.close()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            await writer.wait_closed()
            await websocket.close()
        except (OSError, RuntimeError, WebSocketDisconnect):
            pass
