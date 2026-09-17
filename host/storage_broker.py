#!/usr/bin/env python3
"""Small host service exposing mounted data partitions to Distribox.

The application owns user authorization. This root-only Unix socket accepts
discovered mount IDs, never caller-supplied paths or shell commands. Only a
dedicated distribox directory is shared with the backend and host libvirt.
"""

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import logging
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import struct
import subprocess
import tempfile
import threading
from urllib.parse import urlsplit
from uuid import UUID, uuid4


BASE = Path("/var/lib/distribox")
CONFIG = BASE / "storage.json"
ALIASES = BASE / "storage"
SOCKET = BASE / "run" / "storage.sock"
MARKER = ".distribox-storage-id"
FILESYSTEMS = {"ext2", "ext3", "ext4", "xfs", "btrfs", "zfs", "f2fs", "jfs", "reiserfs", "bcachefs"}
SYSTEM_ROOTS = {"etc", "proc", "sys", "dev", "run", "boot", "usr", "bin", "sbin", "lib", "lib64", "tmp", "var"}
IDENTIFIER = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}\Z")
GIB = 2**30
LOG = logging.getLogger("distribox-storage")


class StorageError(Exception):
    def __init__(self, detail, status=409):
        super().__init__(detail)
        self.status = status


def _root_owned(path, info):
    if info.st_uid != 0 or info.st_mode & 0o022:
        raise StorageError(f"Storage paths must be owned by root and not writable by other accounts: {path}")


def secure_path(path, *, mount_root=None):
    """Existing ancestors cannot be swapped by an unprivileged local account."""
    if not path.is_absolute() or ".." in path.parts:
        raise StorageError("Invalid storage path", 400)
    for component in [*reversed(path.parents), path]:
        try:
            info = component.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode):
            raise StorageError("Storage paths must not contain symbolic links")
        # A mounted data filesystem commonly belongs to the installing user.
        # Its trusted parent prevents replacing the mountpoint itself. The
        # dedicated directory beneath it must still be root-owned, and writes
        # and bind operations pin that directory with file descriptors.
        if not (component == mount_root and any(
                mount["mount_path"] == str(component) for mount in read_mounts())):
            _root_owned(component, info)
    return path


def mkdir(path):
    secure_path(path)
    try:
        path.mkdir(mode=0o755)
        path.chmod(0o755)
    except FileExistsError:
        pass
    if not path.is_dir():
        raise StorageError("Expected a storage directory")


def atomic_write(path, content):
    secure_path(path)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(content)
            output.flush()
            os.fchmod(output.fileno(), 0o644)
            os.fsync(output.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextmanager
def config_lock():
    lock = secure_path(BASE / ".storage-config.lock")
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "a") as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            raise StorageError("Invalid storage configuration lock")
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def validate_name(name):
    if not isinstance(name, str) or not name.strip() or len(name) > 80:
        raise StorageError("Storage names must contain 1–80 characters", 400)
    return name.strip()


def read_config():
    secure_path(CONFIG)
    try:
        config = json.loads(CONFIG.read_text()) if CONFIG.exists() else {"version": 1, "pools": []}
        if not isinstance(config, dict) or config.get("version") != 1 or not isinstance(config.get("pools"), list):
            raise ValueError()
        ids = {"default"}
        paths = set()
        for pool in config["pools"]:
            if not isinstance(pool, dict) or not all(isinstance(pool.get(key), str) for key in ("id", "name", "path", "marker")):
                raise ValueError()
            if not IDENTIFIER.fullmatch(pool["id"]) or pool["id"] in ids or pool["path"] in paths:
                raise ValueError()
            validate_name(pool["name"])
            UUID(pool["marker"])
            if not isinstance(pool.get("enabled", True), bool) or not isinstance(pool.get("managed", False), bool):
                raise ValueError()
            if pool.get("managed"):
                mount = Path(pool["mount_path"])
                if (pool["path"] != str(ALIASES / pool["id"]) or
                        pool["source_path"] != str(mount / "distribox") or not eligible_path(mount)):
                    raise ValueError()
            ids.add(pool["id"])
            paths.add(pool["path"])
        return config
    except (ValueError, TypeError, KeyError, OSError) as exc:
        raise StorageError("Invalid storage configuration on this host", 503) from exc


def save_config(config):
    atomic_write(CONFIG, json.dumps(config, indent=2) + "\n")


def unescape_mount(value):
    return re.sub(r"\\([0-7]{3})", lambda match: chr(int(match[1], 8)), value)


def read_mounts():
    mounts = []
    for line in Path("/proc/self/mountinfo").read_text().splitlines():
        before, after = line.split(" - ", 1)
        fields, filesystem = before.split(), after.split()
        mounts.append({"mount_path": unescape_mount(fields[4]), "device": fields[2],
                       "root": unescape_mount(fields[3]), "filesystem": filesystem[0],
                       "source": unescape_mount(filesystem[1]), "options": fields[5].split(","),
                       "shared": any(field.startswith("shared:") for field in fields[6:])})
    return mounts


def eligible_path(path):
    return (path.is_absolute() and len(path.parts) > 1 and ".." not in path.parts and
            path.parts[1] not in SYSTEM_ROOTS and not path.is_relative_to(BASE) and
            not any(ord(character) < 32 for character in str(path)))


def candidate_id(mount):
    # The device number distinguishes a stale selection after a remount. The
    # persistent pool ID and marker are independent of mount IDs after reboot.
    identity = "\0".join(mount[key] for key in ("mount_path", "device", "root", "filesystem", "source"))
    return "mount-" + hashlib.sha256(identity.encode()).hexdigest()[:24]


def eligible_mounts():
    mounts = read_mounts()
    # Nested bind mounts of the system disk are not additional storage.
    system_devices = {mount["device"] for mount in mounts if mount["mount_path"] == "/"}
    by_path = {mount["mount_path"]: mount for mount in mounts}
    return [mount for mount in by_path.values() if
            mount["filesystem"] in FILESYSTEMS and mount["device"] not in system_devices and
            eligible_path(Path(mount["mount_path"]))]


def validate_mount(mount):
    path = Path(mount["mount_path"])
    secure_path(path, mount_root=path)
    if not path.is_dir() or not path.is_mount():
        raise StorageError("The partition is no longer mounted. Refresh the storage list.")
    if "ro" in mount["options"] or os.statvfs(path).f_flag & os.ST_RDONLY:
        raise StorageError("This partition is read-only")
    actual = os.stat(path).st_dev
    if f"{os.major(actual)}:{os.minor(actual)}" != mount["device"]:
        raise StorageError("The partition changed. Refresh the storage list.")
    return path


def discover():
    config = read_config()
    candidates = []
    for mount in eligible_mounts():
        source = str(Path(mount["mount_path"]) / "distribox")
        existing = next((pool for pool in config["pools"] if pool.get("source_path", pool["path"]) == source), None)
        entry = {"id": candidate_id(mount), "mount_path": mount["mount_path"],
                 "filesystem": mount["filesystem"], "total_gib": 0, "available_gib": 0,
                 "available": False, "reason": None,
                 "configured_storage_id": existing["id"] if existing else None}
        try:
            path = validate_mount(mount)
            usage = shutil.disk_usage(path)
            entry.update(available=True, total_gib=round(usage.total / GIB, 2),
                         available_gib=round(usage.free / GIB, 2))
        except (StorageError, OSError) as exc:
            entry["reason"] = str(exc)
        candidates.append(entry)
    return {"candidates": sorted(candidates, key=lambda item: item["mount_path"])}


def mount_command(*arguments, pass_fds=()):
    try:
        subprocess.run(["/usr/bin/mount", *arguments], check=True, capture_output=True,
                       timeout=15, pass_fds=pass_fds)
    except (OSError, subprocess.SubprocessError) as exc:
        LOG.exception("Storage bind mount failed")
        raise StorageError("Could not expose the storage partition to Distribox", 503) from exc


def prepare():
    mkdir(BASE)
    # is_mount() cannot distinguish a same-filesystem bind from a directory.
    if not any(mount["mount_path"] == str(BASE) for mount in read_mounts()):
        mount_command("--bind", str(BASE), str(BASE))
    mount_command("--make-shared", str(BASE))
    mkdir(ALIASES)
    mkdir(SOCKET.parent)


def check_marker(root, marker, *, mount_root=None):
    marker_path = secure_path(root / MARKER, mount_root=mount_root)
    try:
        if not marker_path.is_file() or marker_path.read_text().strip() != marker:
            raise StorageError("The original storage marker is missing or differs. Restore the original partition.")
    except OSError as exc:
        raise StorageError("Cannot read the storage identity marker") from exc


def same_directory(descriptor, path):
    return os.path.samestat(os.fstat(descriptor), os.stat(path))


def expose(pool):
    source, target = Path(pool["source_path"]), Path(pool["path"])
    secure_path(source, mount_root=Path(pool["mount_path"]))
    source_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        _root_owned(source, os.fstat(source_fd))
        marker_fd = os.open(MARKER, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=source_fd)
        with os.fdopen(marker_fd, "r", encoding="utf-8") as marker:
            info = os.fstat(marker.fileno())
            _root_owned(source / MARKER, info)
            if not stat.S_ISREG(info.st_mode) or marker.read(128).strip() != pool["marker"]:
                raise StorageError("The original storage marker is missing or differs. Restore the original partition.")
        for name in ("images", "vms"):
            descriptor = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=source_fd)
            try:
                _root_owned(source / name, os.fstat(descriptor))
            finally:
                os.close(descriptor)
        mkdir(target)
        if any(mount["mount_path"] == str(target) for mount in read_mounts()):
            if not same_directory(source_fd, target):
                raise StorageError("Another filesystem occupies the storage directory")
            check_marker(target, pool["marker"])
            return
        if any(target.iterdir()):
            raise StorageError("The storage mount directory is not empty")
        # The mount owner may rename distribox after validation. Binding the
        # pinned descriptor cannot be redirected through a replacement link.
        mount_command("--no-canonicalize", "--bind", f"/proc/self/fd/{source_fd}",
                      str(target), pass_fds=(source_fd,))
        if (not any(mount["mount_path"] == str(target) for mount in read_mounts()) or
                not same_directory(source_fd, target)):
            raise StorageError("The storage partition could not be mounted", 503)
        check_marker(target, pool["marker"])
    finally:
        os.close(source_fd)


def initialize_source(mount, pool):
    """Pin the selected filesystem while creating its dedicated directory.

    An ordinary or lazy unmount after discovery must never redirect privileged
    mkdir/write calls onto the system partition beneath the mount point.
    """
    path = Path(mount["mount_path"])
    mount_fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    source_fd = None
    source_created = False
    created_directories = []
    marker_created = False
    try:
        info = os.fstat(mount_fd)
        if f"{os.major(info.st_dev)}:{os.minor(info.st_dev)}" != mount["device"]:
            raise StorageError("The partition changed. Refresh the storage list.")
        try:
            os.mkdir("distribox", mode=0o755, dir_fd=mount_fd)
            source_created = True
        except FileExistsError:
            pass
        source_fd = os.open("distribox", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=mount_fd)
        _root_owned(path / "distribox", os.fstat(source_fd))
        if os.listdir(source_fd):
            raise StorageError("This partition already contains a distribox directory. Restore its storage configuration before enabling it.")
        if source_created:
            os.fchmod(source_fd, 0o755)
        for name in ("images", "vms"):
            os.mkdir(name, mode=0o755, dir_fd=source_fd)
            created_directories.append(name)
            directory_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=source_fd)
            try:
                os.fchmod(directory_fd, 0o755)
            finally:
                os.close(directory_fd)
        marker_fd = os.open(MARKER, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
                            0o644, dir_fd=source_fd)
        marker_created = True
        with os.fdopen(marker_fd, "w", encoding="utf-8") as output:
            output.write(pool["marker"] + "\n")
            output.flush()
            os.fchmod(output.fileno(), 0o644)
            os.fsync(output.fileno())
        os.fsync(source_fd)
        os.fsync(mount_fd)
        # A disappearing partition leaves registration unchanged. Cleanup is
        # also FD-relative, so it cannot touch any replacement filesystem.
        validate_mount(mount)
        check_marker(path / "distribox", pool["marker"], mount_root=path)
    except BaseException:
        if source_fd is not None:
            if marker_created:
                os.unlink(MARKER, dir_fd=source_fd)
            for name in reversed(created_directories):
                os.rmdir(name, dir_fd=source_fd)
        if source_created:
            os.rmdir("distribox", dir_fd=mount_fd)
        raise
    finally:
        if source_fd is not None:
            os.close(source_fd)
        os.close(mount_fd)


def restore():
    """Retry missing partitions without ever creating roots or replacing markers."""
    with config_lock():
        config = read_config()
        mounts = {mount["mount_path"]: mount for mount in eligible_mounts()}
        for pool in config["pools"]:
            if not pool.get("managed"):
                continue
            try:
                mount = mounts.get(pool["mount_path"])
                if mount is None:
                    continue
                validate_mount(mount)
                expose(pool)
            except (OSError, StorageError) as exc:
                LOG.warning("Storage %s unavailable: %s", pool["id"], exc)


def create_location(payload):
    if not isinstance(payload, dict) or set(payload) - {"mount_id", "name"}:
        raise StorageError("Choose a mounted partition and an optional name", 400)
    if not isinstance(payload.get("mount_id"), str):
        raise StorageError("Choose a mounted partition", 400)
    name = validate_name(payload["name"]) if "name" in payload else None
    with config_lock():
        config = read_config()
        mount = next((mount for mount in eligible_mounts() if candidate_id(mount) == payload["mount_id"]), None)
        if mount is None:
            raise StorageError("The selected partition is no longer available. Refresh the storage list.")
        path = validate_mount(mount)
        source = secure_path(path / "distribox", mount_root=path)
        existing = next((pool for pool in config["pools"] if pool.get("source_path", pool["path"]) == str(source)), None)
        if existing:
            if existing.get("managed"):
                expose(existing)
            return existing
        if source.exists() and (not source.is_dir() or any(source.iterdir())):
            raise StorageError("This partition already contains a distribox directory. Restore its storage configuration before enabling it.")
        selected_id = "storage-" + uuid4().hex[:16]
        pool = {"id": selected_id, "name": name or path.name[:80], "path": str(ALIASES / selected_id),
                "source_path": str(source), "mount_path": str(path), "marker": str(uuid4()),
                "enabled": True, "managed": True}
        initialize_source(mount, pool)
        # Persist identity before the bind: a failure is recoverable by the
        # periodic restore, with no unregistered files or new identity on retry.
        config["pools"].append(pool)
        save_config(config)
        expose(pool)
        return pool


def update_location(storage_id, payload):
    if (not isinstance(payload, dict) or not payload or set(payload) - {"name", "enabled"} or
            ("enabled" in payload and not isinstance(payload["enabled"], bool))):
        raise StorageError("Provide a storage name or an enabled flag", 400)
    name = validate_name(payload["name"]) if "name" in payload else None
    with config_lock():
        config = read_config()
        pool = next((pool for pool in config["pools"] if pool["id"] == storage_id), None)
        if pool is None:
            raise StorageError("Storage location not found", 404)
        if name is not None:
            pool["name"] = name
        if "enabled" in payload:
            pool["enabled"] = payload["enabled"]
        # Disabling only affects new allocations. Existing VMs retain storage.
        save_config(config)
        return pool


class Handler(BaseHTTPRequestHandler):
    server_version = "DistriboxStorage/1"

    def setup(self):
        self.request.settimeout(10)
        super().setup()

    def log_message(self, format, *args):
        LOG.info(format, *args)

    def respond(self, status, data):
        content = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def dispatch(self):
        try:
            peer = self.connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i"))
            if struct.unpack("3i", peer)[1] != 0:
                raise StorageError("Only the local Distribox backend may manage host storage", 403)
            path = urlsplit(self.path)
            if path.query or path.fragment:
                raise StorageError("Invalid storage endpoint", 400)
            if self.command == "GET" and path.path == "/mounts":
                self.respond(200, discover())
                return
            if self.command not in {"POST", "PATCH"}:
                raise StorageError("Storage endpoint not found", 404)
            if self.headers.get("Transfer-Encoding"):
                raise StorageError("Transfer encoding is not supported", 400)
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError as exc:
                raise StorageError("Invalid request length", 400) from exc
            if not 0 < length <= 4096:
                raise StorageError("Invalid storage request size", 400)
            try:
                payload = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeDecodeError) as exc:
                raise StorageError("Invalid JSON request", 400) from exc
            if self.command == "POST" and path.path == "/locations":
                result = create_location(payload)
            elif self.command == "PATCH" and re.fullmatch(r"/locations/[a-z0-9][a-z0-9_-]{0,63}", path.path):
                result = update_location(path.path.rsplit("/", 1)[1], payload)
            else:
                raise StorageError("Storage endpoint not found", 404)
            self.respond(200, result)
        except StorageError as exc:
            self.respond(exc.status, {"detail": str(exc)})
        except (OSError, TimeoutError):
            LOG.exception("Host storage request failed")
            self.respond(503, {"detail": "Host storage could not be accessed"})

    do_GET = do_POST = do_PATCH = dispatch


class UnixHTTPServer(HTTPServer):
    address_family = socket.AF_UNIX

    def server_bind(self):
        # HTTPServer assumes an IP address; the handler needs no TCP metadata.
        socket.socket.bind(self.socket, self.server_address)
        self.server_name = "localhost"
        self.server_port = 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    if os.geteuid() != 0:
        parser.error("The storage service must run as root")
    prepare()
    if args.prepare:
        return
    restore()
    secure_path(SOCKET)
    if SOCKET.exists():
        if not stat.S_ISSOCK(SOCKET.lstat().st_mode):
            raise StorageError("Unexpected file at the storage socket path")
        SOCKET.unlink()
    previous_mask = os.umask(0o177)
    try:
        server = UnixHTTPServer(str(SOCKET), Handler)
    finally:
        os.umask(previous_mask)

    def retry_mounts():
        while True:
            threading.Event().wait(30)
            try:
                restore()
            except (StorageError, OSError):
                LOG.exception("Could not restore storage mounts")

    threading.Thread(target=retry_mounts, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
