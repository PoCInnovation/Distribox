import json
import uuid
import os
import re
import secrets
import subprocess
import logging
import stat
import threading
from contextlib import contextmanager, nullcontext
import yaml
from shutil import copy, copymode, rmtree
import httpx
import libvirt
from app.utils.vm import wait_for_state, get_pause_reason, recover_after_pause
from typing import Any, BinaryIO, Callable, Iterator, Optional
from app.core.constants import VMS_DIR, IMAGES_DIR, VM_STATE_NAMES
from app.models.vm import VmCreate, VmRead, VmCredentialCreateRequest, RecoverableVm, RecoverableVmCreate, VmCreateXML, VmRename
from app.models.image import ImageRead
from app.models.operation import OperationRead
from app.core.xml_builder import build_xml, configure_display_resolution, configure_vnc_audio, configure_vnc_clipboard, configure_vnc_keyboard, upgrade_display_devices
from app.core.config import QEMUConfig, engine
from sqlalchemy import func
from sqlmodel import Session, select, delete, col
from app.orm.vm import VmORM
from app.orm.vm_credential import VmCredentialORM
from app.orm.event import EventParticipantORM
from app.orm.slave import SlaveORM
from fastapi import status, HTTPException
from app.utils.vm import get_vm_ip
from app.utils.crypto import decrypt_secret, encrypt_secret
from app.utils.seed import ensure_seed_iso
from app.core.config import s3, distribox_bucket_registry
from app.services.image_service import ImageService
from app.services.operation_service import NO_PROGRESS, VM_CREATE, OperationService, Progress
from pathlib import Path
from sqlalchemy.orm import make_transient

logger = logging.getLogger(__name__)

COPY_CHUNK_SIZE = 4 * 2**20
# Flushing as the copy goes keeps its progress close to what is on disk, and
# spares the resize a wait of minutes on the page cache.
COPY_SYNC_INTERVAL = 64 * 2**20


class _ImageLock:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.waiters = 0


_image_download_locks_guard = threading.Lock()
_image_download_locks: dict[Path, _ImageLock] = {}
# Matches both our staged UUID temp files and boto3 s3transfer's appended suffix.
_STAGED_SUFFIX_RE = re.compile(r"^[0-9a-f]{32}\.tmp(?:\.[0-9A-Za-z]+)?$")


@contextmanager
def _image_download_lock(image_path: Path) -> Iterator[None]:
    with _image_download_locks_guard:
        entry = _image_download_locks.get(image_path)
        if entry is None:
            entry = _ImageLock()
            _image_download_locks[image_path] = entry
        entry.waiters += 1
    try:
        with entry.lock:
            yield
    finally:
        with _image_download_locks_guard:
            entry.waiters -= 1
            if entry.waiters == 0:
                del _image_download_locks[image_path]


def copy_disk(source: Path, target: Path, progress: Progress,
              *, source_file: Optional[BinaryIO] = None) -> None:
    buffer = memoryview(bytearray(COPY_CHUNK_SIZE))
    copied = unsynced = 0
    src_ctx: Any = (
        nullcontext(source_file)
        if source_file is not None
        else source.open("rb")
    )
    with src_ctx as src, target.open("xb") as dst:
        while size := src.readinto(buffer):
            dst.write(buffer[:size])
            copied += size
            unsynced += size
            if unsynced >= COPY_SYNC_INTERVAL:
                dst.flush()
                os.fsync(dst.fileno())
                unsynced = 0
            progress.advance(copied)
        dst.flush()
        os.fsync(dst.fileno())
        mode = stat.S_IMODE(os.fstat(src.fileno()).st_mode)
    os.chmod(target, mode)


def with_vnc_clipboard(conn: libvirt.virConnect, domain_xml: str) -> str:
    candidate = configure_vnc_clipboard(domain_xml)
    if candidate is None:
        return domain_xml
    # Older libvirt or QEMU builds without SPICE lack the qemu-vdagent channel.
    try:
        conn.domainXMLToNative("qemu-argv", candidate, 0)
    except libvirt.libvirtError as e:
        logger.info("Guest clipboard sharing is unavailable: %s", e)
        return domain_xml
    return candidate


def ensure_default_network():
    try:
        conn = QEMUConfig.get_connection()
        net = conn.networkLookupByName("default")
        if not net.isActive():
            logger.info("Starting libvirt 'default' network")
            net.create()
    except libvirt.libvirtError as e:
        logger.error("Failed to ensure default network: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to activate default network: {e}",
        )


def undefine_domain(vm_id: str):
    try:
        conn = QEMUConfig.get_connection()
        vm = conn.lookupByName(vm_id)
    except libvirt.libvirtError as e:
        if e.get_error_code() == libvirt.VIR_ERR_NO_DOMAIN:
            return
        raise
    if vm.isActive() == 1:
        vm.destroy()
    vm.undefineFlags(libvirt.VIR_DOMAIN_UNDEFINE_NVRAM)


class Vm:
    slave_id: Optional[uuid.UUID]
    slave_name: Optional[str]

    @staticmethod
    def _resolve_image_name(os_value: str) -> str:
        if Path(os_value).name != os_value or not os_value.endswith(".qcow2"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid image '{os_value}': expected .qcow2 image",
            )
        return os_value

    @staticmethod
    def _staged_path(target: Path) -> Path:
        return target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")

    @staticmethod
    def _sweep_stale_temp_files(directory: Path, target_name: str) -> None:
        prefix = f".{target_name}."
        for entry in directory.iterdir():
            if (entry.name.startswith(prefix) and
                    _STAGED_SUFFIX_RE.fullmatch(entry.name[len(prefix):])):
                entry.unlink(missing_ok=True)

    @staticmethod
    def _fsync_file(file_path: Path) -> None:
        with file_path.open("rb") as written:
            os.fsync(written.fileno())

    @staticmethod
    def _fsync_dir(directory: Path) -> None:
        dir_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)

    @classmethod
    def _recover_interrupted_refresh(
        cls,
        image_path: Path,
        metadata_path: Path,
        rollback_image: Path,
        commit_metadata: Path,
    ) -> None:
        if not commit_metadata.exists() and not rollback_image.exists():
            return
        slug = image_path.name.removesuffix(".qcow2")
        with ImageService.recovery_guard(slug) as may_recover:
            if not may_recover:
                return
            if commit_metadata.exists():
                local_image = cls._read_local_metadata(metadata_path)
                if local_image is not None and local_image.family == "local":
                    commit_metadata.unlink(missing_ok=True)
                    rollback_image.unlink(missing_ok=True)
                    cls._fsync_dir(image_path.parent)
                elif rollback_image.exists():
                    if (not image_path.exists() or
                            not os.path.samefile(rollback_image, image_path)):
                        restore_tmp = cls._staged_path(image_path)
                        try:
                            os.link(rollback_image, restore_tmp)
                            os.replace(restore_tmp, image_path)
                        finally:
                            restore_tmp.unlink(missing_ok=True)
                        cls._fsync_dir(image_path.parent)
                    commit_metadata.unlink(missing_ok=True)
                    cls._fsync_dir(image_path.parent)
                    rollback_image.unlink(missing_ok=True)
                    cls._fsync_dir(image_path.parent)
                else:
                    image_path.unlink(missing_ok=True)
                    cls._fsync_dir(image_path.parent)
                    commit_metadata.unlink(missing_ok=True)
                    cls._fsync_dir(image_path.parent)
            elif rollback_image.exists():
                rollback_image.unlink(missing_ok=True)
                cls._fsync_dir(image_path.parent)

    @staticmethod
    def _validate_staged_disk(image_path: Path) -> None:
        with image_path.open("rb") as disk:
            header = disk.read(32)
        if (len(header) != 32 or header[:4] != b"QFI\xfb" or
                int.from_bytes(header[4:8], "big") not in (2, 3) or
                int.from_bytes(header[24:32], "big") <= 0):
            raise ValueError(f"Invalid qcow2 image: {image_path.name}")
        result = subprocess.run(
            ["qemu-img", "info", "--output=json", str(image_path)],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            raise ValueError(
                f"Unreadable disk image '{image_path.name}': "
                f"{result.stderr.strip()}"
            )
        info = json.loads(result.stdout)
        image_format = info.get("format")
        if image_format is not None and image_format != "qcow2":
            raise ValueError(f"Expected qcow2 image, got '{image_format}'")
        details = info.get("format-specific", {}).get("data", {})
        if "backing-filename" in info or "data-file" in details:
            raise ValueError(
                f"Disk image '{image_path.name}' depends on an external file"
            )
        virtual_size = info.get("virtual-size")
        if not isinstance(virtual_size, int) or virtual_size <= 0:
            raise ValueError(
                f"Invalid disk virtual size in {image_path.name}")
        check = subprocess.run(
            ["qemu-img", "check", "-f", "qcow2", "--output=json",
             str(image_path)],
            capture_output=True, text=True,
        )
        if check.returncode not in (0, 3):
            detail = check.stderr.strip() or check.stdout.strip()
            raise ValueError(
                f"Corrupted disk image '{image_path.name}': {detail}"
            )
        check_info = json.loads(check.stdout) if check.stdout.strip() else {}
        if (check_info.get("corruptions", 0) or
                check_info.get("check-errors", 0)):
            detail = check.stderr.strip() or check.stdout.strip()
            raise ValueError(
                f"Corrupted disk image '{image_path.name}': {detail}"
            )

    @staticmethod
    def _read_local_metadata(metadata_path: Path) -> Optional[ImageRead]:
        if not metadata_path.exists():
            return None
        try:
            return ImageRead.model_validate(
                yaml.safe_load(metadata_path.read_text(encoding="utf-8"))
            )
        except Exception:
            return None

    @staticmethod
    def has_revision_changed(metadata_filename: str) -> bool:
        local_image = ImageService.get_local_image(metadata_filename)
        if local_image is None:
            return True
        if local_image.family == "local":
            return False
        registry_image = ImageService.get_registry_image(metadata_filename)
        if registry_image is None:
            return False
        return registry_image.revision != local_image.revision

    @staticmethod
    def _download_registry_image(image: str, image_path: Path,
                                 progress: Progress) -> None:
        try:
            size = s3.head_object(
                Bucket=distribox_bucket_registry, Key=image)["ContentLength"]
        except Exception:
            size = None
        progress.phase("fetching_image",
                       size if isinstance(size, int) else None)
        lock = threading.Lock()
        downloaded = 0

        # boto3 calls this from several threads, with the size of each part.
        def on_bytes(amount: int) -> None:
            nonlocal downloaded
            with lock:
                downloaded += amount
                progress.advance(downloaded)

        s3.download_file(distribox_bucket_registry, image, image_path,
                         Callback=on_bytes)

    @classmethod
    def _download_image_locked(cls, image: str, image_path: Path,
                               progress: Progress = NO_PROGRESS) -> Path:
        metadata_filename = ImageService.metadata_filename(image)
        metadata_path = IMAGES_DIR / metadata_filename
        rollback_image = image_path.with_name(f".{image}.rollback.tmp")
        commit_metadata = metadata_path.with_name(
            f".{metadata_filename}.commit.tmp")

        cls._recover_interrupted_refresh(
            image_path, metadata_path, rollback_image, commit_metadata)
        if IMAGES_DIR.exists():
            cls._sweep_stale_temp_files(IMAGES_DIR, image)
            cls._sweep_stale_temp_files(IMAGES_DIR, metadata_filename)

        revision_changed = cls.has_revision_changed(metadata_filename)
        disk_missing = not image_path.exists()
        if not revision_changed and not disk_missing:
            return image_path

        if disk_missing:
            local_image = cls._read_local_metadata(metadata_path)
            if local_image is not None and local_image.family == "local":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Local image '{image}' is missing from host storage",
                )

        with ImageService.claim_download(image.removesuffix(".qcow2")):
            # Re-check local ownership once the download slot is reserved so a
            # local import that finished just before claiming is never overwritten.
            local_image = cls._read_local_metadata(metadata_path)
            if local_image is not None and local_image.family == "local":
                if image_path.exists():
                    return image_path
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Local image '{image}' is missing from host storage",
                )

            IMAGES_DIR.mkdir(parents=True, exist_ok=True)

            staged_metadata: Optional[Path] = None
            staged_image: Optional[Path] = None
            try:
                # Always stage metadata together with the disk so rebuilding a
                # missing disk cannot pair a newer registry disk with stale
                # metadata.
                staged_metadata = cls._staged_path(metadata_path)
                s3.download_file(
                    distribox_bucket_registry,
                    metadata_filename,
                    staged_metadata,
                )
                parsed_metadata = ImageRead.model_validate(
                    yaml.safe_load(
                        staged_metadata.read_text(encoding="utf-8")
                    )
                )
                if parsed_metadata.image != image:
                    raise ValueError(
                        f"Metadata image mismatch for {metadata_filename}: "
                        f"expected {image}, got {parsed_metadata.image}"
                    )
                if parsed_metadata.family == "local":
                    raise ValueError(
                        f"Registry metadata for {metadata_filename} cannot "
                        "use reserved family 'local'"
                    )
                staged_image = cls._staged_path(image_path)
                cls._download_registry_image(image, staged_image, progress)
                cls._validate_staged_disk(staged_image)
                if image_path.exists():
                    copymode(image_path, staged_image)
                cls._fsync_file(staged_image)
                if metadata_path.exists():
                    copymode(metadata_path, staged_metadata)
                cls._fsync_file(staged_metadata)

                # Link the prior disk for rollback, publish the commit marker,
                # then swap disk before metadata so crashes or errors recover
                # cleanly.
                try:
                    if image_path.exists():
                        os.link(image_path, rollback_image)
                        cls._fsync_dir(IMAGES_DIR)
                    os.replace(staged_metadata, commit_metadata)
                    staged_metadata = None
                    cls._fsync_dir(IMAGES_DIR)
                    os.replace(staged_image, image_path)
                    staged_image = None
                    cls._fsync_dir(IMAGES_DIR)
                    os.replace(commit_metadata, metadata_path)
                except BaseException:
                    try:
                        cls._recover_interrupted_refresh(
                            image_path, metadata_path,
                            rollback_image, commit_metadata,
                        )
                    except OSError:
                        logger.warning(
                            "Failed to restore previous cached disk for %s",
                            image,
                        )
                    raise
                try:
                    cls._fsync_dir(IMAGES_DIR)
                    rollback_image.unlink(missing_ok=True)
                    cls._fsync_dir(IMAGES_DIR)
                except OSError:
                    logger.warning(
                        "Post-commit cleanup failed for %s; "
                        "will retry on next cache access",
                        image,
                    )
            finally:
                for temp_path in (staged_image, staged_metadata):
                    if temp_path is not None:
                        temp_path.unlink(missing_ok=True)

        return image_path

    @classmethod
    def _download_image(cls, image: str,
                        progress: Progress = NO_PROGRESS) -> Path:
        image_path = IMAGES_DIR / image
        with _image_download_lock(image_path):
            return cls._download_image_locked(image, image_path, progress)

    @classmethod
    def _require_disk_size(cls, image_path: Path, disk_size: int):
        min_disk_size = ImageService.local_min_disk_size(image_path)
        if disk_size < min_disk_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Disk size must be at least {min_disk_size} GB",
            )

    @classmethod
    def check_disk_size(cls, os_value: str, disk_size: int,
                        progress: Progress = NO_PROGRESS):
        image = cls._resolve_image_name(os_value)
        image_path = IMAGES_DIR / image
        with _image_download_lock(image_path):
            cls._download_image_locked(image, image_path, progress)
            cls._require_disk_size(image_path, disk_size)

    @classmethod
    @contextmanager
    def _open_checked_image(
        cls, os_value: str, disk_size: int,
        progress: Progress = NO_PROGRESS,
    ) -> Iterator[tuple[BinaryIO, str]]:
        """Refresh, validate, and snapshot the disk fd and firmware together."""
        image = cls._resolve_image_name(os_value)
        image_path = IMAGES_DIR / image
        metadata_path = IMAGES_DIR / ImageService.metadata_filename(image)
        with _image_download_lock(image_path):
            cls._download_image_locked(image, image_path, progress)
            cls._require_disk_size(image_path, disk_size)
            local_image = cls._read_local_metadata(metadata_path)
            firmware = local_image.firmware if local_image else "bios"
            source_file = image_path.open("rb")
        try:
            yield source_file, firmware
        finally:
            source_file.close()

    @classmethod
    def check_local_image(cls, os_value: str, disk_size: int):
        """What can be rejected at once, without downloading the image."""
        image = cls._resolve_image_name(os_value)
        image_path = IMAGES_DIR / image
        try:
            before = image_path.stat()
        except FileNotFoundError:
            return
        metadata_filename = ImageService.metadata_filename(image)
        if (IMAGES_DIR / f".{metadata_filename}.commit.tmp").exists():
            return
        try:
            min_disk_size = ImageService.local_min_disk_size(image_path)
        except (subprocess.CalledProcessError, KeyError, ValueError, OSError):
            return
        if disk_size >= min_disk_size:
            return
        if cls.has_revision_changed(metadata_filename):
            return
        try:
            after = image_path.stat()
        except FileNotFoundError:
            return
        if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
            return
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Disk size must be at least {min_disk_size} GB",
        )

    def __init__(self, vm_create: VmCreate,
                 vm_id: Optional[uuid.UUID] = None,
                 progress: Progress = NO_PROGRESS):
        self.id = vm_id or uuid.uuid4()
        self.name = vm_create.name
        self.os = self._resolve_image_name(vm_create.os)
        self.mem = vm_create.mem
        self.vcpus = vm_create.vcpus
        self.disk_size = vm_create.disk_size
        self.keyboard_layout = vm_create.keyboard_layout
        self.ssh_enabled = vm_create.ssh_enabled
        self.state: Optional[str] = None
        self.state = 'Stopped'
        self.ipv4: Optional[str] = None
        self.credentials_count: int = 0

        vm_dir = VMS_DIR / str(self.id)
        image_path = IMAGES_DIR / self.os

        try:
            with self._open_checked_image(
                self.os, self.disk_size, progress
            ) as (source_file, firmware):
                progress.phase(
                    "copying_disk", os.fstat(source_file.fileno()).st_size)
                vm_dir.mkdir(parents=True, exist_ok=False)
                ensure_seed_iso(
                    keyboard_layout=self.keyboard_layout,
                    vm_dir=vm_dir,
                )
                vm_path = vm_dir / self.os
                copy_disk(
                    image_path, vm_path, progress, source_file=source_file)
            progress.phase("resizing_disk")
            resize = subprocess.run(
                ["qemu-img", "resize", vm_path, f"{self.disk_size}G"],
                capture_output=True,
                text=True,
            )
            if resize.returncode != 0:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Could not resize the disk: {resize.stderr.strip()}",
                )
            progress.phase("defining")
            vm_xml = build_xml(VmCreateXML(
                id=self.id,
                os=self.os,
                name=self.name,
                mem=self.mem,
                vcpus=self.vcpus,
                disk_size=self.disk_size,
                keyboard_layout=self.keyboard_layout,
            ), firmware=firmware)
            conn = QEMUConfig.get_connection()
            conn.defineXML(with_vnc_clipboard(conn, vm_xml))
            # The record comes last, so the VM is listed only once its
            # creation is over. A VM that fails to start is still created.
            start_error = None
            if vm_create.activate_at_start is True:
                progress.phase("starting")
                try:
                    self.start()
                except Exception as error:
                    start_error = error
            with Session(engine) as session:
                vm_record = VmORM(
                    id=self.id,
                    name=self.name,
                    os=self.os,
                    mem=self.mem,
                    vcpus=self.vcpus,
                    disk_size=self.disk_size,
                    keyboard_layout=self.keyboard_layout,
                    ssh_enabled=self.ssh_enabled,
                    slave_id=getattr(vm_create, 'slave_id', None),
                )
                session.add(vm_record)
                session.commit()
            if start_error is not None:
                raise start_error
        except Exception:
            raise

    @classmethod
    def get(cls, vm_id: str):
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(vm_id)
            vm_state, reason = vm.state()
            with Session(engine) as session:
                vm_record = session.get(VmORM, uuid.UUID(vm_id))
                if not vm_record:
                    raise HTTPException(
                        status.HTTP_404_NOT_FOUND,
                        f"Vm {vm_id} not found in database"
                    )
                vm_instance = cls.__new__(cls)
                vm_instance.id = vm_record.id
                vm_instance.name = vm_record.name
                vm_instance.os = vm_record.os
                vm_instance.mem = vm_record.mem
                vm_instance.vcpus = vm_record.vcpus
                vm_instance.disk_size = vm_record.disk_size
                vm_instance.keyboard_layout = vm_record.keyboard_layout
                vm_instance.ssh_enabled = vm_record.ssh_enabled
                vm_instance.state = VM_STATE_NAMES.get(vm_state, 'None')
                vm_instance.pause_reason = get_pause_reason(
                    vm, vm_state, reason)
                vm_instance.recovery_warning = None
                vm_instance.ipv4 = get_vm_ip(str(vm_instance.id))
                vm_instance.slave_id = vm_record.slave_id
                vm_instance.slave_name = None
                if vm_record.slave_id:
                    slave = session.get(SlaveORM, vm_record.slave_id)
                    if slave:
                        vm_instance.slave_name = slave.name
                credentials_count_statement = select(func.count()).where(
                    VmCredentialORM.vm_id == vm_record.id
                )
                vm_instance.credentials_count = session.exec(
                    credentials_count_statement
                ).one()
        except libvirt.libvirtError as e:
            if e.get_error_code() == libvirt.VIR_ERR_NO_DOMAIN:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f'Vm {vm_id} not found')
        except Exception:
            raise
        return vm_instance

    @classmethod
    def get_all(cls):
        try:
            with Session(engine) as session:
                statement = select(VmORM)
                vm_records = session.scalars(statement).all()
            vm_list = []
            for vm_record in vm_records:
                vm_list.append(cls.get(str(vm_record.id)))
            return vm_list
        except Exception:
            raise

    def start(self):
        vm_dir = VMS_DIR / str(self.id)
        resuming = False
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(str(self.id))
            state_code, _ = vm.state()
            resuming = state_code == libvirt.VIR_DOMAIN_PAUSED
            if resuming:
                vm.resume()
            elif vm.isActive() == 0:
                per_vm_seed = vm_dir / "seed.iso"
                if not per_vm_seed.exists():
                    ensure_seed_iso(
                        keyboard_layout=self.keyboard_layout,
                        vm_dir=vm_dir,
                    )
                ensure_default_network()
                has_saved_state = vm.hasManagedSaveImage(0)
                original_xml = vm.XMLDesc(
                    libvirt.VIR_DOMAIN_XML_INACTIVE | libvirt.VIR_DOMAIN_XML_SECURE)
                domain_xml = original_xml
                # Saved memory requires the same guest devices on restore.
                if not has_saved_state:
                    domain_xml = upgrade_display_devices(
                        domain_xml) or domain_xml
                    domain_xml = configure_display_resolution(
                        domain_xml) or domain_xml
                    domain_xml = configure_vnc_audio(domain_xml) or domain_xml
                    domain_xml = with_vnc_clipboard(conn, domain_xml)
                domain_xml = configure_vnc_keyboard(
                    domain_xml, self.keyboard_layout) or domain_xml
                if domain_xml != original_xml:
                    conn.defineXML(domain_xml)
                if has_saved_state:
                    saved_xml = vm.managedSaveGetXMLDesc(
                        libvirt.VIR_DOMAIN_SAVE_IMAGE_XML_SECURE)
                    updated_saved_xml = configure_vnc_keyboard(
                        saved_xml, self.keyboard_layout)
                    if updated_saved_xml:
                        vm.managedSaveDefineXML(updated_saved_xml, 0)
                vm.create()
        except libvirt.libvirtError as e:
            if e.get_error_code() == libvirt.VIR_ERR_NO_DOMAIN:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f'Vm {self.id} not found')
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(self._resume_error(vm) if resuming else
                        f"Failed to start VM {self.id}: {str(e)}"),
            ) from e
        except Exception:
            raise
        state_code = wait_for_state(vm, libvirt.VIR_DOMAIN_RUNNING, 0.5, 10)
        self.state = VM_STATE_NAMES.get(state_code, 'None')
        if state_code != libvirt.VIR_DOMAIN_RUNNING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(self._resume_error(vm) if resuming else
                        f"Failed to start VM {self.id}. Current state: {self.state}"),
            )
        self.pause_reason = None
        self.recovery_warning = None
        if resuming:
            from app.services.ssh_guest import invalidate_guest
            invalidate_guest(str(self.id))
            self.recovery_warning = recover_after_pause(vm)
            if vm.state()[0] != libvirt.VIR_DOMAIN_RUNNING:
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    self._resume_error(vm))
        self.ipv4 = get_vm_ip(str(self.id))
        return self

    @staticmethod
    def _resume_error(vm):
        state_code, reason = vm.state()
        cause = get_pause_reason(vm, state_code, reason)
        if cause == "Host disk full":
            return "Host disk full. Free space on this VM's host, then try Resume VM again."
        return "Could not resume the VM. Check its host for disk or I/O errors, then try Resume VM again."

    def stop(self, force: bool = False):
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(str(self.id))
            if vm.isActive() == 1:
                if vm.state()[0] == libvirt.VIR_DOMAIN_PAUSED:
                    if not force:
                        raise HTTPException(
                            status.HTTP_409_CONFLICT,
                            "VM is paused. Resume it first, or use Force stop; unsaved work will be lost.",
                        )
                    vm.destroy()
                else:
                    vm.shutdown()
        except libvirt.libvirtError as e:
            if e.get_error_code() == libvirt.VIR_ERR_NO_DOMAIN:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f'Vm {self.id} not found')
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "Could not stop the VM. Check its host and try again.") from e
        except Exception:
            raise
        state_code = wait_for_state(vm, libvirt.VIR_DOMAIN_SHUTOFF, 5, 10)
        self.state = VM_STATE_NAMES.get(state_code, 'None')
        if state_code != libvirt.VIR_DOMAIN_PAUSED:
            self.pause_reason = None
        return self

    def get_state(self):
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(str(self.id))
            state, _ = vm.state()
        except Exception:
            raise
        return {"state": VM_STATE_NAMES.get(state, 'None')}

    def remove(self):
        try:
            undefine_domain(str(self.id))
        except Exception:
            pass

        vm_dir = VMS_DIR / str(self.id)
        if vm_dir.exists():
            rmtree(vm_dir)

        with Session(engine) as session:
            session.exec(
                delete(EventParticipantORM).where(
                    EventParticipantORM.vm_id == self.id
                )
            )
            session.exec(
                delete(VmCredentialORM).where(
                    VmCredentialORM.vm_id == self.id
                )
            )
            session.exec(
                delete(VmORM).where(VmORM.id == self.id)
            )
            session.commit()


class VmService:
    @staticmethod
    def _parse_vm_id(vm_id: str) -> uuid.UUID:
        try:
            return uuid.UUID(vm_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid VM id",
            ) from exc

    @staticmethod
    def _parse_credential_id(credential_id: str) -> uuid.UUID:
        try:
            return uuid.UUID(credential_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid credential id",
            ) from exc

    @staticmethod
    def _get_vm_or_404(session: Session, vm_id: str) -> VmORM:
        parsed_vm_id = VmService._parse_vm_id(vm_id)
        vm_record = session.get(VmORM, parsed_vm_id)
        if not vm_record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Vm {vm_id} not found",
            )
        return vm_record

    @staticmethod
    def _with_slave_fields(data: dict, slave: SlaveORM, vm_id: str) -> dict:
        with Session(engine) as session:
            data["ssh_enabled"] = VmService._get_vm_or_404(
                session, vm_id).ssh_enabled
        data["slave_id"] = str(slave.id)
        data["slave_name"] = slave.name
        return data

    @staticmethod
    def _get_slave_for_vm(vm_id: str) -> Optional[SlaveORM]:
        """Check if a VM is hosted on a slave node."""
        with Session(engine) as session:
            vm_record = session.get(VmORM, uuid.UUID(vm_id))
            if vm_record and vm_record.slave_id:
                return session.get(SlaveORM, vm_record.slave_id)
        return None

    @staticmethod
    def _get_duplicate_name(session: Session, vm_name: str) -> str:
        base_name = f"Duplicate of {vm_name}"
        search_pattern = f"{base_name}%"

        statement = select(
            func.count(
                col(VmORM.id))).where(
            col(VmORM.name).like(search_pattern))
        count = session.exec(statement).one()
        if count == 0:
            return base_name
        return f"{base_name}({count})"

    @staticmethod
    def get_vm_list():
        with Session(engine) as session:
            vm_records = session.scalars(select(VmORM)).all()
        vm_list = []
        for vm_record in vm_records:
            if vm_record.slave_id:
                # For slave-hosted VMs, build a lightweight response
                # without hitting local libvirt
                slave = None
                with Session(engine) as session:
                    slave = session.get(SlaveORM, vm_record.slave_id)
                if slave and slave.status == "online":
                    try:
                        from app.services.slave_client import slave_get_vm
                        data = slave_get_vm(slave, str(vm_record.id))
                        data["ssh_enabled"] = vm_record.ssh_enabled
                        data["slave_id"] = str(vm_record.slave_id)
                        data["slave_name"] = slave.name
                        vm_list.append(data)
                        continue
                    except Exception:
                        pass
                # Slave offline or unreachable — show VM with unknown state
                vm_list.append({
                    "id": str(vm_record.id),
                    "name": vm_record.name,
                    "os": vm_record.os,
                    "mem": vm_record.mem,
                    "vcpus": vm_record.vcpus,
                    "disk_size": vm_record.disk_size,
                    "keyboard_layout": vm_record.keyboard_layout,
                    "ssh_enabled": vm_record.ssh_enabled,
                    "state": "Unknown",
                    "ipv4": None,
                    "credentials_count": 0,
                    "slave_id": str(vm_record.slave_id),
                    "slave_name": slave.name if slave else "Unknown",
                })
            else:
                try:
                    vm_list.append(Vm.get(str(vm_record.id)))
                except Exception:
                    logger.warning(
                        "Failed to get VM %s from libvirt", vm_record.id)
        return vm_list

    @staticmethod
    def get_vm(vm_id: str):
        slave = VmService._get_slave_for_vm(vm_id)
        if slave:
            if slave.status != "online":
                with Session(engine) as session:
                    vm_record = session.get(VmORM, uuid.UUID(vm_id))
                    if not vm_record:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Vm {vm_id} not found",
                        )
                    return {
                        "id": str(vm_record.id),
                        "name": vm_record.name,
                        "os": vm_record.os,
                        "mem": vm_record.mem,
                        "vcpus": vm_record.vcpus,
                        "disk_size": vm_record.disk_size,
                        "keyboard_layout": vm_record.keyboard_layout,
                        "ssh_enabled": vm_record.ssh_enabled,
                        "state": "Unknown",
                        "ipv4": None,
                        "credentials_count": 0,
                        "slave_id": str(slave.id),
                        "slave_name": slave.name,
                    }
            from app.services.slave_client import slave_get_vm
            return VmService._with_slave_fields(
                slave_get_vm(slave, vm_id), slave, vm_id)
        vm = Vm.get(vm_id)
        return vm

    @staticmethod
    def get_state(vm_id: str):
        vm = Vm.get(vm_id)
        state = vm.get_state()
        return state

    @staticmethod
    def create_vm(vm_create: VmCreate):
        """Create a VM and wait for it, recorded as an operation."""
        operation, job = VmService._prepare_creation(vm_create, None)
        return OperationService.run(operation.id, job)

    @staticmethod
    def start_vm_creation(vm_create: VmCreate,
                          created_by: Optional[str]) -> OperationRead:
        """Create a VM in the background and return its operation."""
        operation, job = VmService._prepare_creation(vm_create, created_by)
        OperationService.run_in_background(operation.id, job)
        return operation

    @staticmethod
    def _prepare_creation(
        vm_create: VmCreate, created_by: Optional[str],
    ) -> tuple[OperationRead, Callable[[Progress], Any]]:
        """Check what can be checked at once, then record the operation."""
        params = vm_create.model_dump(mode="json")
        Vm._resolve_image_name(vm_create.os)
        slave = VmService._pick_slave(vm_create)
        vm_id = uuid.uuid4()
        if slave is None:
            Vm.check_local_image(vm_create.os, vm_create.disk_size)
            phases = ["fetching_image", "copying_disk", "resizing_disk",
                      "defining"]
            if vm_create.activate_at_start:
                phases.append("starting")
        else:
            phases = ["creating_on_node"]

        def job(progress: Progress):
            if slave is None:
                return Vm(vm_create, vm_id, progress)
            return VmService._create_vm_on_slave(
                vm_create, slave, vm_id, progress)

        operation = OperationService.create(
            VM_CREATE,
            vm_create.name,
            phases,
            vm_id=vm_id,
            slave_id=slave.id if slave else None,
            slave_name=slave.name if slave else None,
            params=params,
            created_by=created_by,
        )
        return operation, job

    @staticmethod
    def _pick_slave(vm_create: VmCreate) -> Optional[SlaveORM]:
        """The slave that will host the VM, or None for this host."""
        from app.services.slave_service import SlaveService

        slave_id = vm_create.slave_id
        if slave_id is None and vm_create.auto_place:
            slave_id = VmService._auto_pick_node(
                vm_create.mem, vm_create.vcpus, vm_create.disk_size
            )
        if slave_id is None:
            return None
        slave = SlaveService.get_slave(str(slave_id))
        if slave.status != "online":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Slave {slave.name} is not online",
            )
        return slave

    @staticmethod
    def _auto_pick_node(
            required_mem: int,
            required_vcpus: int,
            required_disk: int):
        """Pick the best node, prioritizing master. Returns slave UUID or None for master."""
        from app.services.host_service import HostService
        from app.services.slave_service import SlaveService
        from app.services.slave_client import (
            PROBE_TIMEOUT,
            slave_get_host_info as _slave_get_host_info,
        )

        try:
            mem, cpus, disk = HostService.get_free_capacity()
            if (mem >= required_mem and cpus >= required_vcpus and
                    disk >= required_disk):
                return None
        except Exception:
            pass

        best_slave = None
        best_mem = -1
        for slave in SlaveService.get_online_slaves():
            try:
                info = _slave_get_host_info(slave, timeout=PROBE_TIMEOUT)
                slave_mem = info.get("mem", {}).get("available", 0)
                slave_cpu = info.get("cpu", {}).get("cpu_count", 0)
                slave_disk = info.get("disk", {}).get("available", 0)
                if (slave_mem >= required_mem and
                        slave_cpu >= required_vcpus and
                        slave_disk >= required_disk and
                        slave_mem > best_mem):
                    best_slave = slave
                    best_mem = slave_mem
            except Exception:
                continue

        return best_slave.id if best_slave else None

    @staticmethod
    def _create_vm_on_slave(vm_create: VmCreate, slave: SlaveORM,
                            vm_id: uuid.UUID, progress: Progress):
        """Create a VM on a slave node."""
        from app.services.slave_client import slave_create_vm

        payload = {
            "id": str(vm_id),
            "os": vm_create.os,
            "name": vm_create.name,
            "mem": vm_create.mem,
            "vcpus": vm_create.vcpus,
            "disk_size": vm_create.disk_size,
            "keyboard_layout": vm_create.keyboard_layout,
            "ssh_enabled": vm_create.ssh_enabled,
            "activate_at_start": vm_create.activate_at_start,
        }
        try:
            result = slave_create_vm(slave, payload)
        except httpx.TimeoutException as error:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=(
                    f"{slave.name} did not finish creating the VM in time. "
                    "It may still appear there as an unmanaged VM."
                ),
            ) from error
        created_id = uuid.UUID(str(result["id"]))
        if created_id != vm_id:
            # A slave on an older version picks the id itself.
            progress.set_vm(created_id)

        # Store a reference in the master DB
        with Session(engine) as session:
            vm_record = VmORM(
                id=created_id,
                name=vm_create.name,
                os=vm_create.os,
                mem=vm_create.mem,
                vcpus=vm_create.vcpus,
                disk_size=vm_create.disk_size,
                keyboard_layout=vm_create.keyboard_layout,
                ssh_enabled=vm_create.ssh_enabled,
                slave_id=slave.id,
            )
            session.add(vm_record)
            session.commit()

        result["slave_id"] = str(slave.id)
        result["slave_name"] = slave.name
        return result

    @staticmethod
    def start_vm(vm_id: str):
        slave = VmService._get_slave_for_vm(vm_id)
        if slave:
            if slave.status != "online":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Slave {slave.name} is offline",
                )
            from app.services.slave_client import slave_start_vm
            return VmService._with_slave_fields(
                slave_start_vm(slave, vm_id), slave, vm_id)
        vm = Vm.get(vm_id)
        return vm.start()

    @staticmethod
    def stop_vm(vm_id: str, force: bool = False):
        slave = VmService._get_slave_for_vm(vm_id)
        if slave:
            if slave.status != "online":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Slave {slave.name} is offline",
                )
            from app.services.slave_client import slave_stop_vm
            return VmService._with_slave_fields(
                slave_stop_vm(slave, vm_id, force=force), slave, vm_id)
        vm = Vm.get(vm_id)
        return vm.stop(force=force)

    @staticmethod
    def remove_vm(vm_id: str):
        slave = VmService._get_slave_for_vm(vm_id)
        if slave:
            if slave.status != "online":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Slave {slave.name} is offline",
                )
            from app.services.slave_client import slave_delete_vm
            slave_delete_vm(slave, vm_id)
            # Remove the reference from master DB
            with Session(engine) as session:
                session.exec(
                    delete(EventParticipantORM).where(
                        col(EventParticipantORM.vm_id) == uuid.UUID(vm_id)
                    )
                )
                session.exec(
                    delete(VmCredentialORM).where(
                        col(VmCredentialORM.vm_id) == uuid.UUID(vm_id)
                    )
                )
                session.exec(
                    delete(VmORM).where(col(VmORM.id) == uuid.UUID(vm_id))
                )
                session.commit()
            return
        vm = Vm.get(vm_id)
        vm.remove()

    @staticmethod
    def restart_vm(vm_id: str):
        slave = VmService._get_slave_for_vm(vm_id)
        if slave:
            if slave.status != "online":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Slave {slave.name} is offline",
                )
            from app.services.slave_client import slave_stop_vm, slave_start_vm
            slave_stop_vm(slave, vm_id)
            return VmService._with_slave_fields(
                slave_start_vm(slave, vm_id), slave, vm_id)
        vm = Vm.get(vm_id)
        vm.stop()
        return vm.start()

    @staticmethod
    def create_vm_credential(vm_id: str, payload: VmCredentialCreateRequest):
        with Session(engine) as session:
            vm_record = VmService._get_vm_or_404(session, vm_id)
            provided_password = payload.password.strip() if payload.password else ""
            if provided_password:
                from app.services.ssh_access import credential_matches

                for existing in session.exec(select(VmCredentialORM)):
                    if credential_matches(existing, provided_password):
                        raise HTTPException(
                            status.HTTP_409_CONFLICT,
                            "This access secret is already in use. Generate a new secret.",
                        )
            credential_password = provided_password or secrets.token_urlsafe(
                32)
            credential = VmCredentialORM(
                vm_id=vm_record.id,
                name=payload.name,
                password=encrypt_secret(credential_password),
                expires_at=payload.expires_at,
            )
            session.add(credential)
            session.commit()
            session.refresh(credential)
            return {
                "id": credential.id,
                "vm_id": credential.vm_id,
                "name": credential.name,
                "password": credential_password,
                "created_at": credential.created_at,
                "expires_at": credential.expires_at,
            }

    @staticmethod
    def list_vm_credentials(vm_id: str):
        with Session(engine) as session:
            vm_record = VmService._get_vm_or_404(session, vm_id)
            statement = (
                select(VmCredentialORM)
                .where(VmCredentialORM.vm_id == vm_record.id)
                .order_by(col(VmCredentialORM.created_at))
            )
            credentials = session.exec(statement).all()
            return [
                {
                    "id": credential.id,
                    "vm_id": credential.vm_id,
                    "name": credential.name,
                    "password": decrypt_secret(credential.password),
                    "created_at": credential.created_at,
                    "expires_at": credential.expires_at,
                }
                for credential in credentials
            ]

    @staticmethod
    def get_vm_credential(vm_id: str, credential_id: str):
        with Session(engine) as session:
            vm_record = VmService._get_vm_or_404(session, vm_id)
            parsed_credential_id = VmService._parse_credential_id(
                credential_id)
            statement = select(VmCredentialORM).where(
                VmCredentialORM.id == parsed_credential_id,
                VmCredentialORM.vm_id == vm_record.id,
            )
            credential = session.exec(statement).first()
            if not credential:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Credential {credential_id} not found",
                )

            return {
                "id": credential.id,
                "vm_id": credential.vm_id,
                "name": credential.name,
                "password": decrypt_secret(credential.password),
                "created_at": credential.created_at,
                "expires_at": credential.expires_at,
            }

    @staticmethod
    def revoke_vm_credential(vm_id: str, credential_id: str):
        with Session(engine) as session:
            vm_record = VmService._get_vm_or_404(session, vm_id)
            parsed_credential_id = VmService._parse_credential_id(
                credential_id)
            statement = select(VmCredentialORM).where(
                VmCredentialORM.id == parsed_credential_id,
                VmCredentialORM.vm_id == vm_record.id,
            )
            credential = session.exec(statement).first()
            if not credential:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Credential {credential_id} not found",
                )
            session.exec(
                delete(VmCredentialORM).where(
                    col(VmCredentialORM.id) == parsed_credential_id
                )
            )
            session.commit()

    @staticmethod
    def get_recoverable_vms() -> list[RecoverableVm]:
        recoverable_vms = []
        # A VM still being created has files and no record yet: it is not
        # untracked until its creation fails or is interrupted. The order
        # matters. A creation is recorded before its folder exists, and its
        # VM before it ends, so folders are read first and VM records last.
        folders = list(Path(VMS_DIR).iterdir())
        creating = OperationService.running_vm_ids()
        with Session(engine) as session:
            for vm in folders:
                if vm.name in creating:
                    continue
                vm_record = session.get(VmORM, uuid.UUID(vm.name))
                if vm_record is None:
                    for vm_file in vm.iterdir():
                        if vm_file.name.endswith(".qcow2"):
                            image_name = ImageService.metadata_filename(
                                vm_file.name)
                            image_metadata = ImageService.get_distribox_image(
                                image_name)
                            recoverable_vms.append(
                                RecoverableVm(
                                    vm_id=vm.name,
                                    **image_metadata.model_dump()))
        return recoverable_vms

    @staticmethod
    def recover_vm(recoverable_vm: RecoverableVmCreate):
        rec_vms_list = VmService.get_recoverable_vms()

        for v in rec_vms_list:
            if v.vm_id == str(recoverable_vm.vm_id):
                with Session(engine) as session:
                    vm_record = VmORM(
                        id=recoverable_vm.vm_id,
                        name=recoverable_vm.name,
                        os=v.image,
                        mem=recoverable_vm.mem,
                        vcpus=recoverable_vm.vcpus,
                        disk_size=recoverable_vm.disk_size,
                    )
                    session.add(vm_record)
                    session.commit()
                    session.refresh(vm_record)
                return VmRead(
                    id=vm_record.id,
                    os=vm_record.os,
                    name=vm_record.name,
                    mem=vm_record.mem,
                    vcpus=vm_record.vcpus,
                    disk_size=vm_record.disk_size,
                    state="Stopped",
                    ipv4=None,
                    credentials_count=0,
                )
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Vm {recoverable_vm.vm_id} not found in database"
        )

    @staticmethod
    def remove_recoverable_vm(vm_id: str):
        for v in VmService.get_recoverable_vms():
            if v.vm_id == vm_id:
                undefine_domain(v.vm_id)
                rmtree(VMS_DIR / v.vm_id)
                return
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Recoverable vm {vm_id} not found"
        )

    @staticmethod
    def remove_all_recoverable_vms():
        vms_to_delete = VmService.get_recoverable_vms()
        vm_root = Path(VMS_DIR)
        for v in vm_root.iterdir():
            for x in vms_to_delete:
                if v.name == str(x.vm_id):
                    undefine_domain(v.name)
                    rmtree(VMS_DIR / v.name)
                    break
        return

    @staticmethod
    def duplicate_vm(vm_id: str):
        with Session(engine) as session:
            vm_to_duplicate = VmService._get_vm_or_404(session, vm_id)
            duplicate_vm = VmORM(**vm_to_duplicate.model_dump())
            duplicate_vm.id = uuid.uuid4()
            duplicate_vm.ssh_enabled = False
            duplicate_vm.name = VmService._get_duplicate_name(
                session, duplicate_vm.name)

            src_dir = VMS_DIR / vm_id
            dest_path = VMS_DIR / str(duplicate_vm.id)

            vm_xml = build_xml(VmCreateXML(**duplicate_vm.model_dump()))

            try:
                session.add(duplicate_vm)
                session.commit()

                dest_path.mkdir(parents=True, exist_ok=True)
                copy(src_dir / duplicate_vm.os, dest_path / duplicate_vm.os)
                seed_src = src_dir / "seed.iso"
                if seed_src.exists():
                    copy(seed_src, dest_path / "seed.iso")

                conn = QEMUConfig.get_connection()
                conn.defineXML(with_vnc_clipboard(conn, vm_xml))
            except Exception as e:
                if dest_path.exists():
                    rmtree(dest_path)
                with Session(engine) as cleanup_session:
                    db_vm = cleanup_session.get(
                        VmORM, duplicate_vm.id)
                    if db_vm:
                        cleanup_session.delete(db_vm)
                        cleanup_session.commit()
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to duplicate VM: {str(e)}"
                )

            return Vm.get(str(duplicate_vm.id))

    @staticmethod
    def rename_vm(vm_id: str, vm_rename: VmRename):
        with Session(engine) as session:
            vm = VmService._get_vm_or_404(session, vm_id)
            vm.name = vm_rename.name
            session.add(vm)
            session.commit()
            return Vm.get(str(vm.id))
