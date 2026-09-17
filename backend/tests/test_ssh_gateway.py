import asyncio
import socket
from types import SimpleNamespace

import asyncssh
import pytest
import pytest_asyncio
from websockets.asyncio.server import serve

from app.services import ssh_gateway, ssh_transport


@pytest_asyncio.fixture
async def gateway(monkeypatch, tmp_path):
    client_key = asyncssh.generate_private_key("ssh-ed25519")
    details = {}
    guests = []
    allowed = {"credential-a": True, "credential-b": True}

    class GuestServer(asyncssh.SSHServer):
        def public_key_auth_supported(self):
            return True

        def validate_public_key(self, username, key):
            return username == "user" and key == client_key.convert_to_public()

    async def guest_process(process, vm_id):
        if process.command == "binary":
            process.stdout.write(b"\x00\xff\x80output")
            process.stderr.write(b"\x00\xfeerror")
            process.exit(7)
        elif process.command == "terminal":
            process.stdout.write(
                f"{process.term_type}:{process.term_size[:2]}\n".encode())
            while True:
                try:
                    data = await process.stdin.read(1024)
                    if not data:
                        process.exit(0)
                        return
                    process.stdout.write(b"guest:" + data)
                except asyncssh.TerminalSizeChanged as exc:
                    process.stdout.write(
                        f"resize:{exc.width}:{exc.height}\n".encode())
                except asyncssh.SignalReceived as exc:
                    process.exit_with_signal(exc.signal)
                    return
        else:
            process.stdout.write(vm_id.encode())
            process.exit(0)

    for vm_id in ("vm-a", "vm-b"):
        host_key = asyncssh.generate_private_key("ssh-ed25519")
        guest = await asyncssh.listen(
            "127.0.0.1", 0,
            server_factory=GuestServer,
            config=None,
            gss_host=None,
            server_host_keys=[host_key],
            process_factory=lambda process, vm_id=vm_id: guest_process(
                process, vm_id),
            sftp_factory=lambda channel: asyncssh.SFTPServer(
                channel, chroot=str(tmp_path)),
            encoding=None,
        )
        guests.append(guest)
        details[vm_id] = {
            "host": "127.0.0.1",
            "port": guest.get_port(),
            "username": "user",
            "private_key": client_key.export_private_key().decode(),
            "host_keys": [host_key.export_public_key().decode()],
        }

    def authenticate(credential_id, password):
        if not allowed.get(credential_id) or password != f"secret-{credential_id}":
            return None
        return credential_id.replace("credential", "vm")

    async def prepare(vm_id):
        return None, details[vm_id]

    monkeypatch.setattr(ssh_gateway, "authenticate_ssh", authenticate)
    monkeypatch.setattr(ssh_gateway, "ssh_access_valid",
                        lambda credential_id, vm_id: allowed.get(credential_id, False))
    monkeypatch.setattr(ssh_gateway, "ACCESS_CHECK_INTERVAL", 0.02)
    monkeypatch.setattr(ssh_transport, "_prepare_guest", prepare)
    monkeypatch.setenv("SSH_ENABLED", "true")
    monkeypatch.setenv("SSH_LISTEN_HOST", "127.0.0.1")
    monkeypatch.setenv("SSH_PORT", "0")
    monkeypatch.setenv("SSH_HOST_KEY_PATH", str(tmp_path / "host_key"))
    monkeypatch.setenv("DISTRIBOX_SECRET",
                       "test-secret-with-at-least-thirty-two-characters")
    monkeypatch.setenv("JWT_SECRET_KEY", "")
    listener = await ssh_gateway.start_ssh_gateway()

    def connect(username="credential-a", password=None):
        return asyncssh.connect(
            "127.0.0.1", listener.get_port(),
            username=username,
            password=password if password is not None else f"secret-{username}",
            known_hosts=(
                [ssh_gateway._load_host_key().convert_to_public()], [], []),
            client_keys=[],
            agent_path=None,
            config=None,
            encoding=None,
        )

    yield SimpleNamespace(connect=connect, allowed=allowed, details=details)
    await ssh_gateway.stop_ssh_gateway(listener)
    for guest in guests:
        guest.close()
        await guest.wait_closed()


@pytest.mark.asyncio
async def test_authentication_and_vm_isolation(gateway):
    for username, password in [
        ("credential-a", "credential-a"),
        ("credential-a", "secret-credential-b"),
        ("missing", "secret-credential-a"),
    ]:
        with pytest.raises(asyncssh.PermissionDenied):
            await gateway.connect(username, password)
    for suffix in ("a", "b"):
        async with gateway.connect(f"credential-{suffix}") as client:
            result = await client.run("vm-id")
            assert result.stdout == f"vm-{suffix}".encode()


@pytest.mark.asyncio
async def test_host_disabled_rejects_authentication(gateway):
    gateway.allowed["credential-a"] = False
    with pytest.raises(asyncssh.PermissionDenied):
        await gateway.connect()


@pytest.mark.asyncio
async def test_binary_exec_and_exit_status(gateway):
    async with gateway.connect() as client:
        result = await client.run("binary")
        assert result.stdout == b"\x00\xff\x80output"
        assert result.stderr == b"\x00\xfeerror"
        assert result.exit_status == 7


@pytest.mark.asyncio
async def test_sftp_transfer(gateway):
    async with gateway.connect() as client:
        async with client.start_sftp_client() as sftp:
            async with sftp.open("transfer", "wb") as destination:
                await destination.write(b"\x00\xffsecure transfer")
            async with sftp.open("transfer", "rb") as source:
                assert await source.read() == b"\x00\xffsecure transfer"


@pytest.mark.asyncio
async def test_terminal_resize_and_signal(gateway):
    async with gateway.connect() as client:
        async with client.create_process("terminal", term_type="xterm", term_size=(80, 24)) as process:
            assert await asyncio.wait_for(process.stdout.readline(), 2) == b"xterm:(80, 24)\n"
            process.change_terminal_size(100, 40)
            assert await asyncio.wait_for(process.stdout.readline(), 2) == b"resize:100:40\n"
            process.send_signal("TERM")
            result = await asyncio.wait_for(process.wait(), 2)
            assert result.exit_signal[0] == "TERM"


@pytest.mark.asyncio
async def test_terminal_forwards_each_byte_without_local_echo(gateway):
    async with gateway.connect() as client:
        async with client.create_process("terminal", term_type="xterm") as process:
            await asyncio.wait_for(process.stdout.readline(), 2)
            for data in (b"x", b"\x1b", b"[", b"A", b"\x03"):
                process.stdin.write(data)
                received = await asyncio.wait_for(process.stdout.readexactly(7), 2)
                assert received == b"guest:" + data
            process.stdin.write_eof()
            result = await asyncio.wait_for(process.wait(), 2)
            assert result.stdout == b""
            assert result.exit_status == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("active_session", [False, True])
async def test_revocation_disconnects_entire_connection(gateway, active_session):
    async with gateway.connect() as client:
        if active_session:
            process = await client.create_process("terminal", term_type="xterm")
            await asyncio.wait_for(process.stdout.readline(), 2)
        gateway.allowed["credential-a"] = False
        await asyncio.wait_for(client.wait_closed(), 2)
        assert client.is_closed()


@pytest.mark.asyncio
async def test_access_check_failure_closes_connection(gateway, monkeypatch):
    def fail(*args):
        raise RuntimeError("Database unavailable")

    async with gateway.connect() as client:
        monkeypatch.setattr(ssh_gateway, "ssh_access_valid", fail)
        await asyncio.wait_for(client.wait_closed(), 2)
        assert client.is_closed()


@pytest.mark.asyncio
async def test_forwarding_is_denied(gateway):
    async with gateway.connect() as client:
        with pytest.raises(asyncssh.ChannelOpenError):
            await client.open_connection("127.0.0.1", 22)
        with pytest.raises(asyncssh.ChannelListenError):
            await client.forward_remote_port("127.0.0.1", 0, "127.0.0.1", 22)
        with pytest.raises(asyncssh.ChannelOpenError):
            await client.open_unix_connection("/run/docker.sock")
        with pytest.raises(asyncssh.ChannelListenError):
            await client.forward_remote_path("/tmp/ssh-denied", "/run/docker.sock")


@pytest.mark.asyncio
async def test_guest_host_key_mismatch_is_rejected(gateway):
    key = asyncssh.generate_private_key("ssh-ed25519")
    gateway.details["vm-a"]["host_keys"] = [key.export_public_key().decode()]
    async with gateway.connect() as client:
        result = await client.run("vm-id")
        assert result.exit_status == 1
        assert result.stdout == b""
        assert b"VM SSH is unavailable" in result.stderr


@pytest.mark.asyncio
@pytest.mark.filterwarnings("error::ResourceWarning")
@pytest.mark.filterwarnings("error::pytest.PytestUnraisableExceptionWarning")
async def test_slave_transport_preserves_ssh_and_sftp(gateway, monkeypatch):
    requests = []

    async def relay(websocket):
        requests.append(
            (websocket.request.path, websocket.request.headers["X-Slave-Token"]))
        target = gateway.details["vm-a"]
        sock = socket.socket()
        sock.setblocking(False)
        await asyncio.get_running_loop().sock_connect(sock, (target["host"], target["port"]))
        await ssh_transport._relay_socket(sock, websocket)

    async with serve(relay, "127.0.0.1", 0) as server:
        slave = SimpleNamespace(hostname="127.0.0.1", port=server.sockets[0].getsockname()[
                                1], api_key="slave-token")

        async def prepare(vm_id):
            return slave, gateway.details[vm_id]

        monkeypatch.setattr(ssh_transport, "_prepare_guest", prepare)
        async with gateway.connect() as client:
            result = await asyncio.wait_for(client.run("binary"), 3)
            assert result.stdout == b"\x00\xff\x80output"
            assert result.exit_status == 7
            async with client.start_sftp_client() as sftp:
                async with sftp.open("slave-transfer", "wb") as destination:
                    await destination.write(b"\x00\xffslave transfer")
                async with sftp.open("slave-transfer", "rb") as source:
                    assert await source.read() == b"\x00\xffslave transfer"
        assert requests == [("/vms/vm-a/ssh/tunnel", "slave-token")] * 2


@pytest.mark.asyncio
async def test_disabled_gateway_and_weak_secret(monkeypatch):
    monkeypatch.setenv("SSH_ENABLED", "false")
    assert await ssh_gateway.start_ssh_gateway() is None
    monkeypatch.setenv("SSH_ENABLED", "true")
    monkeypatch.setenv("DISTRIBOX_SECRET", "secret")
    with pytest.raises(RuntimeError, match="DISTRIBOX_SECRET"):
        await ssh_gateway.start_ssh_gateway()


@pytest.mark.asyncio
@pytest.mark.parametrize("secret", ["short", "your-secret-key-change-in-production"])
async def test_weak_jwt_secret_is_rejected(monkeypatch, secret):
    monkeypatch.setenv("SSH_ENABLED", "true")
    monkeypatch.setenv("DISTRIBOX_SECRET",
                       "test-secret-with-at-least-thirty-two-characters")
    monkeypatch.setenv("JWT_SECRET_KEY", secret)
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        await ssh_gateway.start_ssh_gateway()


def test_host_key_persists_with_private_permissions(monkeypatch, tmp_path):
    key_path = tmp_path / "host_key"
    monkeypatch.setenv("SSH_HOST_KEY_PATH", str(key_path))
    first = ssh_gateway._load_host_key().get_fingerprint()
    assert ssh_gateway._load_host_key().get_fingerprint() == first
    assert key_path.stat().st_mode & 0o777 == 0o600


def test_slave_endpoints_require_token_and_valid_vm_id(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect
    from app.routes import ssh_slave
    from app.utils import slave_auth

    resolved = []

    def resolve(vm_id):
        resolved.append(vm_id)
        raise ConnectionError("VM unavailable")

    monkeypatch.setattr(ssh_slave, "SLAVE_API_KEY", "private-slave-token")
    monkeypatch.setattr(slave_auth, "SLAVE_API_KEY", "private-slave-token")
    monkeypatch.setattr(ssh_slave, "resolve_guest_target", resolve)
    monkeypatch.setattr(ssh_slave, "prepare_guest",
                        lambda vm_id: {"vm_id": vm_id})
    app = FastAPI()
    app.include_router(ssh_slave.router)
    vm_id = "ac09cd51-c9ed-498a-bfab-4c95ed9732e6"
    headers = {"X-Slave-Token": "private-slave-token"}
    with TestClient(app) as client:
        assert client.post(f"/vms/{vm_id}/ssh/prepare").status_code == 422
        assert client.post(
            f"/vms/{vm_id}/ssh/prepare", headers={"X-Slave-Token": "wrong"}).status_code == 401
        assert client.post(f"/vms/{vm_id}/ssh/prepare",
                           headers=headers).json() == {"vm_id": vm_id}
        assert client.post("/vms/invalid/ssh/prepare",
                           headers=headers).status_code == 422
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/vms/{vm_id}/ssh/tunnel"):
                pass
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/vms/invalid/ssh/tunnel", headers=headers):
                pass
        assert resolved == []
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/vms/{vm_id}/ssh/tunnel?host=127.0.0.1&port=8000", headers=headers):
                pass
        assert resolved == [vm_id]
