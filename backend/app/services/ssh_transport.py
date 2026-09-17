import asyncio
import socket
from contextlib import asynccontextmanager

import asyncssh
from websockets.asyncio.client import connect


async def _prepare_guest(vm_id: str):
    from app.services.ssh_guest import prepare_guest
    from app.services.slave_client import slave_request
    from app.services.vm_service import VmService

    slave = await asyncio.to_thread(VmService._get_slave_for_vm, vm_id)
    if slave:
        if slave.status != "online":
            raise ConnectionError("VM host is offline")
        details = await asyncio.to_thread(
            slave_request, slave, "POST", f"/vms/{vm_id}/ssh/prepare"
        )
    else:
        details = await asyncio.to_thread(prepare_guest, vm_id)
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
    slave, details = await asyncio.wait_for(_prepare_guest(vm_id), 120)
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
