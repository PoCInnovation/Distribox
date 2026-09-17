"""Storage locations shared by the backend and host libvirt.

Clients select opaque IDs, never paths. External locations must retain the
marker created by the host storage service; a missing mount must not spill writes
onto the system disk. Existing installations keep the implicit default location.
"""
from contextlib import contextmanager
from dataclasses import dataclass
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
from uuid import UUID

from fastapi import HTTPException

from app.core.constants import BASE_DIR

GIB = 2**30
RESERVE_BYTES = GIB
CONFIG_PATH = BASE_DIR / "storage.json"
STORAGE_ID = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}\Z")


@dataclass(frozen=True)
class StorageLocation:
    id: str
    name: str
    path: Path
    marker: str | None = None
    enabled: bool = True
    managed: bool = False
    source_path: Path | None = None

    @property
    def display_path(self) -> str:
        return str(self.source_path or self.path)


def safe_image_name(name: str) -> str:
    if (not isinstance(name, str) or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9._-]*\.qcow2", name) or
            len(name) > 200 or ".." in name):
        raise HTTPException(400, "Choose a valid .qcow2 image filename")
    return name


def _no_symlinks(path: Path) -> Path:
    for part in [*reversed(path.parents), path]:
        if part.is_symlink():
            raise HTTPException(
                409, "Storage paths must not contain symbolic links")
    return path


def _is_mount(path: Path) -> bool:
    # os.path.ismount cannot detect all bind mounts on the same filesystem.
    if path.is_mount():
        return True
    try:
        for line in Path("/proc/self/mountinfo").read_text().splitlines():
            fields = line.split()
            if len(fields) > 5:
                target = re.sub(
                    r"\\([0-7]{3})", lambda match: chr(int(match[1], 8)), fields[4])
                if target == str(path):
                    return True
    except OSError:
        pass
    return False


class StorageService:
    safe_image_name = staticmethod(safe_image_name)

    @staticmethod
    def locations() -> list[StorageLocation]:
        default = StorageLocation("default", "System storage", BASE_DIR)
        if not CONFIG_PATH.exists() and not CONFIG_PATH.is_symlink():
            return [default]
        try:
            _no_symlinks(CONFIG_PATH)
            config = json.loads(CONFIG_PATH.read_text())
            if (not isinstance(config, dict) or config.get("version") != 1 or
                    not isinstance(config.get("pools"), list)):
                raise ValueError("Expected version 1 and a pools array")
            locations = [default]
            for entry in config["pools"]:
                if not isinstance(entry, dict) or not all(
                    isinstance(entry.get(key), str)
                    for key in ("id", "name", "path", "marker")
                ):
                    raise ValueError("Invalid storage entry")
                storage_id = entry["id"]
                root = Path(entry["path"])
                name = entry["name"]
                marker = str(UUID(entry["marker"]))
                enabled = entry.get("enabled", True)
                managed = entry.get("managed", False)
                if not isinstance(enabled, bool) or not isinstance(managed, bool):
                    raise ValueError("Invalid storage flags")
                source_path = None
                if managed:
                    source_path = Path(entry["source_path"])
                    if (root != BASE_DIR / "storage" / storage_id or
                            not source_path.is_absolute() or
                            ".." in source_path.parts or
                            source_path == Path("/") or
                            source_path.is_relative_to(BASE_DIR)):
                        raise ValueError("Invalid managed storage path")
                if (storage_id == "default" or not STORAGE_ID.fullmatch(storage_id) or
                        not name.strip() or len(name) > 80 or
                        not root.is_absolute() or ".." in root.parts or
                        root == Path("/") or
                        root.parts[1] in {
                            "etc", "proc", "sys", "dev", "run", "boot",
                            "usr", "bin", "sbin", "lib", "lib64"}):
                    raise ValueError("Invalid storage location")
                if any(storage_id == loc.id or root == loc.path or
                       root.is_relative_to(loc.path) or
                       loc.path.is_relative_to(root) for loc in locations
                       if not (managed and loc.id == "default")):
                    raise ValueError(
                        "Storage IDs and directories must be distinct")
                locations.append(StorageLocation(
                    storage_id, name.strip(), root, marker, enabled, managed, source_path))
            return locations
        except (ValueError, KeyError, TypeError, OSError, HTTPException) as exc:
            raise HTTPException(
                503, "Invalid storage configuration; check storage.json on this host") from exc

    @staticmethod
    def _validate(location: StorageLocation) -> StorageLocation:
        try:
            root = _no_symlinks(location.path)
            if not root.is_dir():
                raise OSError("The storage directory is missing")
            if location.managed and not _is_mount(root):
                raise OSError("The storage directory is not mounted")
            if location.marker:
                marker = _no_symlinks(root / ".distribox-storage-id")
                if marker.read_text().strip() != location.marker:
                    raise OSError("The storage identity does not match")
            for folder in (root / "vms", root / "images"):
                _no_symlinks(folder)
                if not folder.is_dir():
                    raise OSError("The storage directories are missing")
                if not os.access(folder, os.W_OK | os.X_OK):
                    raise OSError("The storage directory is not writable")
            if os.statvfs(root).f_flag & os.ST_RDONLY:
                raise OSError("The filesystem is read-only")
            return location
        except (OSError, HTTPException) as exc:
            raise HTTPException(
                409, f"{location.name} is unavailable. Check its mount and permissions on this host.") from exc

    @classmethod
    def get(cls, storage_id: str = "default") -> StorageLocation:
        for location in cls.locations():
            if location.id == storage_id:
                return cls._validate(location)
        raise HTTPException(
            400, "Unknown storage location. Refresh the storage list and choose again.")

    @classmethod
    def overview(cls) -> dict:
        locations = []
        for location in cls.locations():
            entry = {"id": location.id, "name": location.name,
                     "path": location.display_path, "available": False,
                     "enabled": location.enabled, "managed": location.managed,
                     "total_gib": 0.0, "available_gib": 0.0, "reason": None}
            try:
                cls._validate(location)
                usage = shutil.disk_usage(location.path)
                entry.update(available=True, total_gib=round(usage.total / GIB, 2),
                             available_gib=round(usage.free / GIB, 2))
            except HTTPException as exc:
                entry["reason"] = exc.detail
            except OSError:
                entry["reason"] = "Cannot read free space. Check the storage mount on this host."
            locations.append(entry)
        usable = [entry for entry in locations if entry["available"] and
                  entry["enabled"]]
        recommended = max(
            usable, key=lambda entry: entry["available_gib"], default=None)
        return {"locations": locations,
                "recommended_id": recommended["id"] if recommended else None}

    @classmethod
    def select(cls, storage_id: str | None, required_bytes: int = 0) -> StorageLocation:
        if storage_id is not None:
            location = cls.get(storage_id)
        else:
            overview = cls.overview()
            if overview["recommended_id"] is None:
                raise HTTPException(
                    409, "No storage location is available. Check the mounts on this host.")
            location = cls.get(overview["recommended_id"])
        if not location.enabled:
            raise HTTPException(
                409, "This storage location is disabled for new VMs. Choose another location.")
        cls.ensure_space(location, required_bytes)
        return location

    @classmethod
    def ensure_space(cls, location: StorageLocation, required_bytes: int):
        cls._validate(location)
        try:
            free = shutil.disk_usage(location.path).free
        except OSError as exc:
            raise HTTPException(409, "Cannot read storage free space") from exc
        if required_bytes < 0:
            raise HTTPException(400, "Storage size must be positive")
        if free < required_bytes + RESERVE_BYTES:
            raise HTTPException(
                507, f"Not enough space on {location.name}: {free / GIB:.1f} GiB free; "
                f"{(required_bytes + RESERVE_BYTES) / GIB:.1f} GiB needed including 1 GiB of headroom. "
                "Choose another storage location or reduce the disk size.")

    @classmethod
    def vm_dir(cls, storage_id: str, vm_id) -> Path:
        try:
            vm_id = str(UUID(str(vm_id)))
        except ValueError as exc:
            raise HTTPException(400, "Invalid VM id") from exc
        return _no_symlinks(cls.get(storage_id).path / "vms" / vm_id)

    @classmethod
    def images_dir(cls, storage_id: str) -> Path:
        return cls.get(storage_id).path / "images"

    @classmethod
    @contextmanager
    def lock(cls, location: StorageLocation):
        cls._validate(location)
        lock_path = location.path / "images" / ".storage.lock"
        try:
            descriptor = os.open(lock_path, os.O_CREAT |
                                 os.O_RDWR | os.O_NOFOLLOW, 0o600)
        except OSError as exc:
            raise HTTPException(
                409, "Cannot lock storage. Check its mount and permissions.") from exc
        with os.fdopen(descriptor, "r+") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise HTTPException(409, "Invalid storage lock file")
            fcntl.flock(stream, fcntl.LOCK_EX)
            try:
                cls._validate(location)
                yield
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)
