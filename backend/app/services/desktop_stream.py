"""Encoded desktop connections and their backpressured WebSocket relay."""
import asyncio
import json
import logging
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import WebSocket, WebSocketDisconnect
from websockets.asyncio.client import ClientConnection, connect

from app.orm.slave import SlaveORM
from app.services.gliss import gliss_session

logger = logging.getLogger(__name__)


def is_resize(message: str) -> bool:
    try:
        decoded = json.loads(message)
    except ValueError:
        return False
    return isinstance(decoded, dict) and decoded.get("type") == "resize"


@asynccontextmanager
async def local_stream(vnc_host: str, vnc_port: int) -> AsyncIterator[ClientConnection]:
    async with gliss_session(vnc_host, vnc_port) as (url, headers), connect(
        url, additional_headers=headers, max_size=None, compression=None, proxy=None,
    ) as stream:
        yield stream


@asynccontextmanager
async def slave_stream(slave: SlaveORM, vm_id: str) -> AsyncIterator[ClientConnection]:
    hostname = f"[{slave.hostname}]" if ":" in slave.hostname else slave.hostname
    async with connect(
        f"ws://{hostname}:{slave.port}/vms/{vm_id}/desktop/tunnel",
        additional_headers={"X-Slave-Token": slave.api_key},
        open_timeout=10, max_size=None, compression=None, proxy=None,
    ) as stream:
        yield stream


async def relay_stream(websocket: WebSocket,
                       upstream: AbstractAsyncContextManager[ClientConnection],
                       *, resize: bool = True) -> None:
    await websocket.accept()
    try:
        async with upstream as stream:
            async def receive():
                async for message in websocket.iter_text():
                    if resize or not is_resize(message):
                        await stream.send(message)

            async def send():
                async for message in stream:
                    if isinstance(message, bytes):
                        await websocket.send_bytes(message)
                    else:
                        await websocket.send_text(message)

            tasks = [asyncio.create_task(
                receive()), asyncio.create_task(send())]
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
    except WebSocketDisconnect:
        return
    except Exception as exc:
        logger.warning("Desktop stream failed: %s", exc)
        reason = "Cannot stream the VM desktop"
    else:
        reason = "The VM desktop stream ended"
    try:
        await websocket.close(code=1011, reason=reason)
    except (RuntimeError, WebSocketDisconnect):
        pass
