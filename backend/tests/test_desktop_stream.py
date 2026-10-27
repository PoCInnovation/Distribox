import asyncio
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest
import pytest_asyncio
import uvicorn
from fastapi import FastAPI
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed, InvalidStatus

from app.routes import slave_agent, tunnel
from app.services import desktop_stream, gliss

VM_ID = "ac09cd51-c9ed-498a-bfab-4c95ed9732e6"
VIDEO = b"GLV1\x00\xff\x80" * 2048


@asynccontextmanager
async def serve_app(app):
    # Bind before starting Uvicorn so the kernel chooses the port without races.
    import socket
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(
        app, log_level="critical", lifespan="off", ws_per_message_deflate=False))
    task = asyncio.create_task(server.serve(sockets=[sock]))
    try:
        async with asyncio.timeout(3):
            while not server.started:
                if task.done():
                    await task
                    raise RuntimeError("Test server stopped before startup")
                await asyncio.sleep(.01)
        yield f"ws://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        try:
            await asyncio.wait_for(task, 3)
        finally:
            sock.close()


@pytest_asyncio.fixture
async def nodes(monkeypatch):
    state = SimpleNamespace(targets=[], closed=asyncio.Event(), active=0, slave=None)

    async def native(stream):
        state.active += 1
        state.closed.clear()
        await stream.send(json.dumps({"type": "hello", "codec": "h264"}))
        await stream.send(VIDEO)
        try:
            async for message in stream:
                if json.loads(message).get("type") == "stop":
                    break
                await stream.send(message)
        finally:
            state.active -= 1
            if state.active == 0:
                state.closed.set()

    async with serve(native, "127.0.0.1", 0, compression=None) as native_server:
        port = native_server.sockets[0].getsockname()[1]

        @asynccontextmanager
        async def session(host, vnc_port):
            state.targets.append((host, vnc_port))
            yield f"ws://127.0.0.1:{port}", {}

        monkeypatch.setattr(desktop_stream, "gliss_session", session)
        monkeypatch.setattr(slave_agent, "SLAVE_API_KEY", "private-slave-token")
        monkeypatch.setattr(slave_agent, "VNC_HOST", "slave-local-vnc")

        def slave_port(vm_id):
            assert vm_id == VM_ID
            return 5907

        def master_port(vm_id):
            assert vm_id == VM_ID
            assert state.slave is None, "Master must not connect to slave VNC"
            return 5908

        monkeypatch.setattr(slave_agent, "get_vnc_port", slave_port)
        monkeypatch.setattr(tunnel, "get_vnc_port", master_port)
        monkeypatch.setattr(tunnel, "VNC_HOST", "master-local-vnc")
        monkeypatch.setattr(tunnel, "_find_vm_for_credential",
                            lambda credential: VM_ID if credential == "valid" else None)
        monkeypatch.setattr(tunnel.VmService, "_get_slave_for_vm", lambda vm_id: state.slave)
        monkeypatch.setattr(tunnel, "_resize_owners", {})
        slave_app = FastAPI()
        slave_app.include_router(slave_agent.router)
        master_app = FastAPI()
        master_app.include_router(tunnel.router)
        async with serve_app(slave_app) as slave_url, serve_app(master_app) as master_url:
            state.host = SimpleNamespace(hostname="127.0.0.1", port=int(slave_url.rsplit(":", 1)[1]),
                                         api_key="private-slave-token", status="online")
            state.slave_url = slave_url
            state.master_url = master_url
            yield state


async def first_frame(stream):
    assert json.loads(await asyncio.wait_for(stream.recv(), 2)) == {"type": "hello", "codec": "h264"}
    assert await asyncio.wait_for(stream.recv(), 2) == VIDEO
    assert "Sec-WebSocket-Extensions" not in stream.response.headers


async def released_owner():
    # The network close handshake can finish before the route's finally block.
    async with asyncio.timeout(2):
        while tunnel._resize_owners[VM_ID][1]:
            await asyncio.sleep(.01)


@pytest.mark.asyncio
@pytest.mark.parametrize("remote", [False, True], ids=["local", "slave"])
async def test_desktop_preserves_video_controls_and_resize_owner(nodes, remote):
    if remote:
        nodes.slave = nodes.host
    url = nodes.master_url + "/tunnel?credential=valid"
    async with connect(url + "&viewer=owner") as owner:
        await first_frame(owner)
        resize = json.dumps({"type": "resize", "width": 1280, "height": 800, "id": 1})
        await owner.send(resize)
        assert await asyncio.wait_for(owner.recv(), 2) == resize
        async with connect(url + "&viewer=other") as other:
            await first_frame(other)
            await other.send(resize)
            # An ordered echo of the next control proves the resize was filtered.
            for control in ({"type": "key", "keysym": 97, "down": True, "id": 2},
                            {"type": "clipboard", "text": "héllo\nworld", "id": 3},
                            {"type": "ack", "sequence": 7}):
                message = json.dumps(control)
                await other.send(message)
                assert await asyncio.wait_for(other.recv(), 2) == message
        expected = ("slave-local-vnc", 5907) if remote else ("master-local-vnc", 5908)
        assert nodes.targets == [expected, expected]
    await asyncio.wait_for(nodes.closed.wait(), 2)
    await released_owner()
    assert tunnel._resize_owners[VM_ID][1] == 0


@pytest.mark.asyncio
async def test_slave_rejects_missing_wrong_or_unconfigured_token_before_vnc(nodes, monkeypatch):
    url = nodes.slave_url + f"/vms/{VM_ID}/desktop/tunnel"
    for headers in ({}, {"X-Slave-Token": "wrong"}):
        with pytest.raises(InvalidStatus) as exc:
            async with connect(url, additional_headers=headers):
                pass
        assert exc.value.response.status_code == 403
    monkeypatch.setattr(slave_agent, "SLAVE_API_KEY", "")
    with pytest.raises(InvalidStatus):
        async with connect(url, additional_headers={"X-Slave-Token": "private-slave-token"}):
            pass
    assert nodes.targets == []


@pytest.mark.asyncio
async def test_slave_uses_only_its_configured_vnc_target(nodes):
    headers = {"X-Slave-Token": "private-slave-token"}
    with pytest.raises(InvalidStatus):
        async with connect(nodes.slave_url + "/vms/invalid/desktop/tunnel", additional_headers=headers):
            pass
    async with connect(nodes.slave_url + f"/vms/{VM_ID}/desktop/tunnel?host=evil&port=1",
                       additional_headers=headers) as stream:
        await first_frame(stream)
    await asyncio.wait_for(nodes.closed.wait(), 2)
    assert nodes.targets == [("slave-local-vnc", 5907)]


@pytest.mark.asyncio
async def test_master_denies_invalid_credentials_before_starting_stream(nodes):
    nodes.slave = nodes.host
    with pytest.raises(InvalidStatus):
        async with connect(nodes.master_url + "/tunnel?credential=wrong"):
            pass
    assert nodes.targets == []


@pytest.mark.asyncio
async def test_slave_disconnect_and_upstream_end_close_the_master_stream(nodes):
    nodes.slave = nodes.host
    async with connect(nodes.master_url + "/tunnel?credential=valid") as stream:
        await first_frame(stream)
        await stream.send('{"type":"stop"}')
        with pytest.raises(ConnectionClosed):
            await asyncio.wait_for(stream.recv(), 2)
    await asyncio.wait_for(nodes.closed.wait(), 2)
    await released_owner()
    assert tunnel._resize_owners[VM_ID][1] == 0


@pytest.mark.asyncio
async def test_master_reports_rejected_slave_connection_without_starting_local_gliss(nodes):
    nodes.slave = nodes.host
    nodes.host.api_key = "wrong"
    async with connect(nodes.master_url + "/tunnel?credential=valid") as stream:
        with pytest.raises(ConnectionClosed) as exc:
            await asyncio.wait_for(stream.recv(), 2)
        assert exc.value.rcvd.reason == "Cannot stream the VM desktop"
    assert nodes.targets == []
    await released_owner()
    assert tunnel._resize_owners[VM_ID][1] == 0


@pytest.mark.asyncio
async def test_relay_cancellation_releases_both_directions_and_upstream():
    entered = asyncio.Event()
    stopped = []

    class Browser:
        async def accept(self):
            pass

        async def iter_text(self):
            try:
                entered.set()
                await asyncio.Future()
                yield ""
            finally:
                stopped.append("browser")

    class Upstream:
        async def __aiter__(self):
            try:
                await asyncio.Future()
                yield b""
            finally:
                stopped.append("upstream")

    @asynccontextmanager
    async def session():
        try:
            yield Upstream()
        finally:
            stopped.append("session")

    task = asyncio.create_task(desktop_stream.relay_stream(Browser(), session()))
    await asyncio.wait_for(entered.wait(), 2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert sorted(stopped) == ["browser", "session", "upstream"]


@pytest.mark.asyncio
@pytest.mark.parametrize("name,value", [
    ("GLISS_IN_FLIGHT_FRAMES", "0"), ("GLISS_IN_FLIGHT_FRAMES", "9"),
    ("GLISS_IN_FLIGHT_FRAMES", "invalid"),
    ("GLISS_FPS", "0"), ("GLISS_FPS", "61"), ("GLISS_H264_BITRATE", "0"),
    ("GLISS_H264_BITRATE", "999"), ("GLISS_H264_BITRATE", "50000001"),
])
async def test_invalid_video_settings_are_rejected_before_launch(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(ValueError, match=name):
        async with gliss.gliss_session("127.0.0.1", 5900):
            pytest.fail("Invalid settings must not start a worker")


@pytest.mark.asyncio
@pytest.mark.parametrize("bitrate", ["1000", "1500000", "50000000"])
async def test_configured_video_settings_start_the_pinned_native_server(monkeypatch, bitrate):
    monkeypatch.setenv("GLISS_IN_FLIGHT_FRAMES", "6")
    monkeypatch.setenv("GLISS_FPS", "24")
    monkeypatch.setenv("GLISS_H264_BITRATE", bitrate)
    # Gliss opens VNC on WS admission. Starting its authenticated HTTP session
    # verifies these flags against the installed binary without a VM.
    async with gliss.gliss_session("127.0.0.1", 1) as (url, headers):
        assert url.startswith("ws://127.0.0.1:")
        assert headers["Cookie"].startswith("gliss_session=")
