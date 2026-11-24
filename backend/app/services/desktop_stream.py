"""Encoded desktop connections and their backpressured WebSocket relay."""
import asyncio
import json
import logging
from contextlib import AbstractAsyncContextManager, AsyncExitStack, asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import WebSocket, WebSocketDisconnect
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import InvalidURI

from app.orm.slave import SlaveORM
from app.services.gliss import gliss_session
from app.services.slave_client import (
    SlaveUnreachableError,
    slave_address,
    unreachable_slave_detail,
)

logger = logging.getLogger(__name__)

# Paused reads can prevent a stalled connection from finishing its close
# handshake. Bound that wait so the viewer releases its Gliss/VNC session.
CLOSE_TIMEOUT_S = 2


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
        close_timeout=CLOSE_TIMEOUT_S,
    ) as stream:
        yield stream


@asynccontextmanager
async def slave_stream(slave: SlaveORM, vm_id: str) -> AsyncIterator[ClientConnection]:
    address = slave_address(slave)
    async with AsyncExitStack() as stack:
        try:
            stream = await stack.enter_async_context(connect(
                f"ws://{address}/vms/{vm_id}/desktop/tunnel",
                additional_headers={"X-Slave-Token": slave.api_key},
                open_timeout=10, max_size=None, compression=None, proxy=None,
                close_timeout=CLOSE_TIMEOUT_S,
            ))
        except (OSError, TimeoutError, InvalidURI) as exc:
            raise SlaveUnreachableError(
                status_code=502,
                detail=unreachable_slave_detail(slave, exc),
                slave_name=getattr(slave, "name", None),
                address=address,
            ) from exc
        yield stream


def _truncate_utf8(text: str, limit: int) -> str:
    encoded = text.encode("utf-8")
    if len(encoded) <= limit:
        return text
    if limit <= 3:
        return encoded[:limit].decode("utf-8", errors="ignore")
    return encoded[: limit - 3].decode("utf-8", errors="ignore").rstrip() + "..."


def _ws_close_reason(exc: SlaveUnreachableError, limit: int = 123) -> str:
    detail = str(exc.detail)
    if len(detail.encode("utf-8")) <= limit:
        return detail
    if exc.address:
        if exc.slave_name:
            prefix = "Cannot reach slave '"
            suffix = f"' at {exc.address}"
            budget = (
                limit - len(prefix.encode("utf-8")) -
                len(suffix.encode("utf-8"))
            )
            if budget > 0:
                return f"{prefix}{_truncate_utf8(exc.slave_name, budget)}{suffix}"
        fallback = f"Cannot reach slave at {exc.address}"
        if len(fallback.encode("utf-8")) <= limit:
            return fallback
        if len(exc.address.encode("utf-8")) <= limit:
            return exc.address
    return _truncate_utf8(detail, limit)


async def relay_stream(websocket: WebSocket,
                       upstream: AbstractAsyncContextManager[ClientConnection],
                       *, resize: bool = True,
                       expose_unreachable: bool = False) -> None:
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
    except SlaveUnreachableError as exc:
        logger.warning("Desktop stream failed: %s", exc.detail)
        reason = (
            _ws_close_reason(exc)
            if expose_unreachable
            else "Cannot stream the VM desktop"
        )
    except Exception as exc:
        logger.warning("Desktop stream failed: %s", exc)
        reason = "Cannot stream the VM desktop"
    else:
        reason = "The VM desktop stream ended"
    try:
        await websocket.close(code=1011, reason=reason)
    except (RuntimeError, WebSocketDisconnect):
        pass
