import asyncio
import logging
import os
from pathlib import Path
from threading import Lock

import asyncssh

from app.services.ssh_transport import connect_guest

logger = logging.getLogger(__name__)

ACCESS_CHECK_INTERVAL = 2
ACCESS_CHECK_TIMEOUT = 3
_host_key_lock = Lock()
_connections: set[asyncssh.SSHServerConnection] = set()


def ssh_enabled() -> bool:
    return os.getenv("SSH_ENABLED", "false").lower() in {"true", "1", "yes"}


def _load_host_key() -> asyncssh.SSHKey:
    key_path = Path(os.getenv("SSH_HOST_KEY_PATH",
                    "/var/lib/distribox/ssh/host_key"))
    with _host_key_lock:
        key_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "wb") as key_file:
                key_file.write(asyncssh.generate_private_key(
                    "ssh-ed25519").export_private_key())
        key_path.chmod(0o600)
        return asyncssh.read_private_key(key_path)


def get_ssh_host_fingerprint() -> str | None:
    if not ssh_enabled():
        return None
    return _load_host_key().get_fingerprint()


def authenticate_ssh(credential_id: str, password: str) -> str | None:
    from app.services.ssh_access import authenticate_ssh as authenticate

    return authenticate(credential_id, password)


def ssh_access_valid(credential_id: str, vm_id: str) -> bool:
    from app.services.ssh_access import ssh_access_valid as valid

    return valid(credential_id, vm_id)


async def _access_valid(credential_id: str, vm_id: str) -> bool:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(ssh_access_valid, credential_id, vm_id),
            ACCESS_CHECK_TIMEOUT,
        )
    except Exception:
        logger.exception("Failed to verify SSH access")
        return False


class GatewayServer(asyncssh.SSHServer):
    def __init__(self):
        self.attempts = 0
        self.monitor = None

    def connection_made(self, conn):
        self.conn = conn
        _connections.add(conn)

    def connection_lost(self, exc):
        _connections.discard(self.conn)
        if self.monitor:
            self.monitor.cancel()

    def password_auth_supported(self):
        return True

    def kbdint_auth_supported(self):
        return False

    async def validate_password(self, username, password):
        self.attempts += 1
        if self.attempts > 3:
            self.conn.close()
            return False
        try:
            vm_id = await asyncio.wait_for(
                asyncio.to_thread(authenticate_ssh, username, password), 10
            )
        except Exception:
            logger.exception("SSH authentication failed")
            return False
        if not vm_id:
            return False
        self.conn.set_extra_info(credential_id=username, vm_id=vm_id)
        return True

    def auth_completed(self):
        self.monitor = asyncio.create_task(self._monitor_access())

    def session_requested(self):
        return GatewayProcess(handle_process, None, 3, False)

    async def _monitor_access(self):
        while await _access_valid(
            self.conn.get_extra_info("credential_id"),
            self.conn.get_extra_info("vm_id"),
        ):
            await asyncio.sleep(ACCESS_CHECK_INTERVAL)
        self.conn.close()


class GatewayProcess(asyncssh.SSHServerProcess):
    def subsystem_requested(self, subsystem):
        return subsystem == "sftp"

    def session_started(self):
        channel = self.channel
        channel.get_connection().create_task(self._start_process(
            asyncssh.SSHReader(self, channel),
            asyncssh.SSHWriter(self, channel),
            asyncssh.SSHWriter(self, channel, asyncssh.EXTENDED_DATA_STDERR),
        ))


async def _proxy_process(process: asyncssh.SSHServerProcess):
    vm_id = process.get_extra_info("vm_id")
    credential_id = process.get_extra_info("credential_id")
    if not await _access_valid(credential_id, vm_id):
        process.exit(1)
        return
    if process.subsystem not in {None, "sftp"}:
        process.stderr.write(b"Unsupported SSH subsystem.\n")
        process.exit(1)
        return
    try:
        async with connect_guest(vm_id) as guest:
            async with guest.create_process(
                command=process.command,
                subsystem=process.subsystem,
                term_type=process.term_type,
                term_size=process.term_size,
                term_modes=process.term_modes,
                encoding=None,
            ) as remote:
                await process.redirect(remote.stdin, remote.stdout, remote.stderr)
                await remote.wait_closed()
                if remote.exit_signal:
                    process.exit_with_signal(*remote.exit_signal)
                else:
                    process.exit(
                        remote.exit_status if remote.exit_status is not None else 1)
    except Exception:
        logger.exception("SSH connection to VM %s failed", vm_id)
        process.stderr.write(
            b"VM SSH is unavailable. Check that the VM is running and SSH is installed.\n")
        process.exit(1)


async def handle_process(process: asyncssh.SSHServerProcess):
    tasks = [
        asyncio.create_task(_proxy_process(process)),
        asyncio.create_task(process.wait_closed()),
    ]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def start_ssh_gateway():
    if not ssh_enabled():
        return None
    secret = os.getenv("DISTRIBOX_SECRET", "")
    if len(secret) < 32 or secret == "distribox-default-secret-change-me":
        raise RuntimeError(
            "SSH requires a unique DISTRIBOX_SECRET of at least 32 characters")
    jwt_secret = os.getenv("JWT_SECRET_KEY")
    if jwt_secret and (
        len(jwt_secret) < 32 or jwt_secret == "your-secret-key-change-in-production"
    ):
        raise RuntimeError(
            "SSH requires a unique JWT_SECRET_KEY of at least 32 characters")
    return await asyncssh.listen(
        os.getenv("SSH_LISTEN_HOST", "0.0.0.0"),
        int(os.getenv("SSH_PORT", "2222")),
        server_factory=GatewayServer,
        config=None,
        gss_host=None,
        server_host_keys=[await asyncio.to_thread(_load_host_key)],
        encoding=None,
        line_editor=False,
        login_timeout=30,
        agent_forwarding=False,
        x11_forwarding=False,
    )


async def stop_ssh_gateway(listener):
    if listener:
        listener.close()
        await listener.wait_closed()
    connections = list(_connections)
    for conn in connections:
        conn.close()
    await asyncio.gather(*(conn.wait_closed() for conn in connections))
