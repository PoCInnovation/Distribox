import asyncio
import socket
from contextlib import asynccontextmanager
from typing import Literal

import asyncssh
from fastapi import HTTPException
from websockets.asyncio.client import connect


def preparation_status(details: object, *, allow_pending: bool) -> Literal["ready", "pending"]:
    if isinstance(details, dict):
        if allow_pending and details.get("pending") is True:
            return "pending"
        host_keys = details.get("host_keys")
        port = details.get("port")
        if (not details.get("pending") and
                all(isinstance(details.get(field), str) and details[field] for field in
                    ("host", "username", "private_key")) and
                isinstance(port, int) and not isinstance(port, bool) and 0 < port <= 65535 and
                isinstance(host_keys, list) and host_keys and
                all(isinstance(key, str) and key for key in host_keys)):
            return "ready"
    raise HTTPException(
        503, "VM host returned incomplete SSH preparation; update the host backend and retry")


async def prepare_guest_connection(vm_id: str, *, refresh: bool = False,
                                   defer_if_stopped: bool = False):
    from app.services.ssh_guest import prepare_guest, GUEST_AGENT_REQUIRED, GUEST_SETUP_ERRORS
    from app.services.slave_client import slave_request
    from app.services.vm_service import VmService

    slave = await asyncio.to_thread(VmService._get_slave_for_vm, vm_id)
    if slave:
        if slave.status != "online":
            raise HTTPException(503, "VM host is offline")
        path = f"/vms/{vm_id}/ssh/prepare"
        if refresh or defer_if_stopped:
            path += f"?refresh={str(refresh).lower()}&defer_if_stopped={str(defer_if_stopped).lower()}"
        try:
            details = await asyncio.to_thread(slave_request, slave, "POST", path)
        except HTTPException as exc:
            detail = str(exc.detail).removeprefix("Slave error: ")
            if detail not in {GUEST_AGENT_REQUIRED, *GUEST_SETUP_ERRORS.values()}:
                detail = "VM host could not prepare SSH; check its guest agent, OpenSSH server and user account"
            raise HTTPException(
                exc.status_code if exc.status_code in {409, 503, 504} else 503,
                detail,
            ) from exc
        if refresh and (not isinstance(details, dict) or details.get("refresh_applied") is not True):
            raise HTTPException(
                503, "VM host does not support SSH preparation on enable; update the slave backend")
    else:
        details = await asyncio.to_thread(
            prepare_guest, vm_id, refresh=refresh, defer_if_stopped=defer_if_stopped)
    preparation_status(details, allow_pending=defer_if_stopped)
    return slave, details


async def _relay_socket(sock, websocket):
    loop = asyncio.get_running_loop()

    async def send():
        while data := await loop.sock_recv(sock, 65536):
            await websocket.send(data)

    async def receive():
        async for data in websocket:
            if not isinstance(data, bytes):
                raise ValueError("SSH relay requires binary messages")
            await loop.sock_sendall(sock, data)

    tasks = [asyncio.create_task(send()), asyncio.create_task(receive())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        try:
            await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            sock.close()


@asynccontextmanager
async def connect_guest(vm_id: str):
    slave, details = await asyncio.wait_for(prepare_guest_connection(vm_id), 120)
    host_keys = [asyncssh.import_public_key(
        key) for key in details["host_keys"]]
    if not host_keys:
        raise ValueError("VM has no trusted SSH host keys")
    options = {
        "host": details["host"],
        "port": details["port"],
        "username": details["username"],
        "client_keys": [asyncssh.import_private_key(details["private_key"])],
        "known_hosts": (host_keys, [], []),
        "config": None,
        "agent_path": None,
        "connect_timeout": 15,
        "login_timeout": 15,
        "encoding": None,
    }
    if not slave:
        async with asyncssh.connect(**options) as connection:
            yield connection
        return
    hostname = f"[{slave.hostname}]" if ":" in slave.hostname else slave.hostname
    async with connect(
        f"ws://{hostname}:{slave.port}/vms/{vm_id}/ssh/tunnel",
        additional_headers={"X-Slave-Token": slave.api_key},
        open_timeout=10,
        max_size=65536,
        max_queue=16,
        compression=None,
        proxy=None,
    ) as websocket:
        client_socket, relay_socket = socket.socketpair()
        client_socket.setblocking(False)
        relay_socket.setblocking(False)
        relay = asyncio.create_task(_relay_socket(relay_socket, websocket))
        try:
            async with asyncssh.connect(sock=client_socket, **options) as connection:
                yield connection
        finally:
            client_socket.close()
            relay.cancel()
            try:
                await asyncio.gather(relay, return_exceptions=True)
            finally:
                relay_socket.close()
