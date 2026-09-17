import uuid
import secrets
import subprocess
import logging
import os
import tempfile
from contextlib import contextmanager
from shutil import copy, rmtree
import libvirt
from app.utils.vm import wait_for_state
from typing import Optional
from app.core.constants import VM_STATE_NAMES
from app.models.vm import VmCreate, VmRead, VmCredentialCreateRequest, RecoverableVm, RecoverableVmCreate, VmCreateXML, VmRename
from app.models.image import ImageRead
from app.core.xml_builder import build_xml
from app.core.config import QEMUConfig, engine
from sqlalchemy import func
from sqlmodel import Session, select, delete
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
import yaml
from pathlib import Path
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)


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


class Vm:
    @staticmethod
    def _resolve_image_name(os_value: str) -> str:
        return StorageService.safe_image_name(os_value)

    @staticmethod
    def _cache_image(location, image_name: str, disk_size: int) -> Path:
        """Check capacity and publish a complete image before its revision metadata."""
        images_dir = StorageService.images_dir(location.id)
        image_path = images_dir / image_name
        metadata_name = image_name.removesuffix(".qcow2") + ".metadata.yaml"
        metadata_path = images_dir / metadata_name
        if image_path.is_symlink() or metadata_path.is_symlink():
            raise HTTPException(
                409, "The image cache contains an unsafe symbolic link")
        try:
            response = s3.get_object(
                Bucket=distribox_bucket_registry, Key=metadata_name)
            metadata_text = response["Body"].read().decode("utf-8")
            metadata = ImageRead(**yaml.safe_load(metadata_text))
            if metadata.image != image_name:
                raise ValueError(
                    "Image metadata does not match the requested image")
            local_revision = None
            if metadata_path.is_file():
                try:
                    local_revision = ImageRead(**yaml.safe_load(
                        metadata_path.read_text(encoding="utf-8"))).revision
                except (ValueError, TypeError, yaml.YAMLError):
                    pass
            download_needed = not image_path.is_file() or local_revision != metadata.revision
            image_bytes = (
                int(s3.head_object(Bucket=distribox_bucket_registry,
                    Key=image_name)["ContentLength"])
                if download_needed else image_path.stat().st_size
            )
        except Exception as exc:
            raise HTTPException(
                502, "Cannot read the image registry; try again shortly") from exc

        # The copy and its requested growth need room even when the base image is cached.
        required_bytes = disk_size * 1024 ** 3 + \
            image_bytes * (2 if download_needed else 1)
        StorageService.ensure_space(location, required_bytes)
        if not download_needed:
            return image_path

        temporary_image = None
        temporary_metadata = None
        try:
            with tempfile.NamedTemporaryFile(dir=images_dir, suffix=".part", delete=False) as stream:
                temporary_image = Path(stream.name)
            s3.download_file(distribox_bucket_registry,
                             image_name, str(temporary_image))
            if temporary_image.stat().st_size != image_bytes:
                raise OSError("The image download is incomplete")
            # QEMU must be able to read the cached image after it is copied.
            temporary_image.chmod(0o644)
            with temporary_image.open("rb") as stream:
                os.fsync(stream.fileno())
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=images_dir,
                                             suffix=".part", delete=False) as stream:
                temporary_metadata = Path(stream.name)
                stream.write(metadata_text)
                stream.flush()
                os.fsync(stream.fileno())
            temporary_image.replace(image_path)
            temporary_metadata.replace(metadata_path)
        except Exception as exc:
            raise HTTPException(
                502, "The image download failed; retry to download it again") from exc
        finally:
            for temporary in (temporary_image, temporary_metadata):
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
        return image_path

    @staticmethod
    @contextmanager
    def _prepared_image(storage_id: Optional[str], image_name: str, disk_size: int):
        if storage_id is not None:
            candidates = [storage_id]
        else:
            locations = StorageService.overview()["locations"]
            candidates = [entry["id"] for entry in sorted(
                locations, key=lambda entry: entry["available_gib"], reverse=True)
                if entry["available"] and entry["enabled"]]
        if not candidates:
            raise HTTPException(
                409, "No storage location is available. Check the mounts on this host.")
        capacity_error = None
        for candidate in candidates:
            try:
                location = StorageService.select(
                    candidate, disk_size * 1024 ** 3)
            except HTTPException as exc:
                if storage_id is None and exc.status_code == 507:
                    capacity_error = exc
                    continue
                raise
            with StorageService.lock(location):
                try:
                    image_path = Vm._cache_image(
                        location, image_name, disk_size)
                except HTTPException as exc:
                    if storage_id is None and exc.status_code == 507:
                        capacity_error = exc
                        continue
                    raise
                # Keep the lock until the caller finishes copying and defining the VM.
                yield location, image_path
                return
        raise capacity_error

    def __init__(self, vm_create: VmCreate):
        self.id = uuid.uuid4()
        self.name = vm_create.name
        self.os = self._resolve_image_name(vm_create.os)
        self.mem = vm_create.mem
        self.vcpus = vm_create.vcpus
        self.disk_size = vm_create.disk_size
        self.keyboard_layout = vm_create.keyboard_layout
        self.ssh_enabled = vm_create.ssh_enabled
        self.state = "Stopped"
        self.ipv4 = None
        self.credentials_count = 0
        self.slave_id = None
        self.slave_name = None

        vm_dir = None
        domain = None
        created_directory = False
        try:
            with self._prepared_image(vm_create.storage_id, self.os, self.disk_size) as (location, image_path):
                self.storage_id = location.id
                self.storage_path = location.display_path
                vm_dir = StorageService.vm_dir(location.id, self.id)
                vm_dir.mkdir(exist_ok=False)
                created_directory = True
                ensure_seed_iso(
                    keyboard_layout=self.keyboard_layout, vm_dir=vm_dir)
                copy(image_path, vm_dir / self.os)
                subprocess.run(["qemu-img", "resize", str(vm_dir / self.os),
                                f"+{self.disk_size}G"], check=True)
                vm_record = VmORM(
                    id=self.id, name=self.name, os=self.os, mem=self.mem,
                    vcpus=self.vcpus, disk_size=self.disk_size,
                    keyboard_layout=self.keyboard_layout, ssh_enabled=self.ssh_enabled,
                    storage_id=self.storage_id,
                )
                domain = QEMUConfig.get_connection().defineXML(
                    build_xml(VmCreateXML(**vm_record.model_dump())))
                with Session(engine) as session:
                    session.add(vm_record)
                    session.commit()
            if vm_create.activate_at_start:
                self.start()
        except Exception:
            # Remove only this attempt's files; a failed cache download never publishes .part files.
            cleanup_safe = True
            if domain is not None:
                try:
                    if domain.isActive():
                        domain.destroy()
                    domain.undefine()
                except libvirt.libvirtError:
                    cleanup_safe = False
                    logger.exception(
                        "Could not remove failed VM domain %s", self.id)
            if cleanup_safe:
                try:
                    with Session(engine) as session:
                        session.exec(delete(VmORM).where(VmORM.id == self.id))
                        session.commit()
                except Exception:
                    logger.exception(
                        "Could not remove failed VM database record %s", self.id)
            if created_directory and cleanup_safe:
                rmtree(vm_dir)
            raise

    @classmethod
    def get(cls, vm_id: str):
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(vm_id)
            vm_state, _ = vm.state()
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
                vm_instance.storage_id = vm_record.storage_id
                vm_instance.storage_path = next((
                    location.display_path for location in StorageService.locations()
                    if location.id == vm_record.storage_id
                ), None)
                vm_instance.keyboard_layout = vm_record.keyboard_layout
                vm_instance.ssh_enabled = vm_record.ssh_enabled
                vm_instance.state = VM_STATE_NAMES.get(vm_state, 'None')
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
        location = StorageService.get(self.storage_id)
        with StorageService.lock(location):
            return self._start()

    def _start(self):
        vm_dir = StorageService.vm_dir(self.storage_id, self.id)
        disk_path = vm_dir / StorageService.safe_image_name(self.os)
        per_vm_seed = vm_dir / "seed.iso"
        if not disk_path.is_file() or disk_path.is_symlink() or per_vm_seed.is_symlink():
            raise HTTPException(
                409, "The VM disk or seed is unavailable or unsafe")
        if not per_vm_seed.exists():
            ensure_seed_iso(
                keyboard_layout=self.keyboard_layout,
                vm_dir=vm_dir,
            )
        ensure_default_network()
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(str(self.id))
            if vm.isActive() == 0:
                vm.create()
        except libvirt.libvirtError as e:
            if e.get_error_code() == libvirt.VIR_ERR_NO_DOMAIN:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f'Vm {self.id} not found')
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Failed to start VM {self.id}: {str(e)}",
            ) from e
        except Exception:
            raise
        state_code = wait_for_state(vm, libvirt.VIR_DOMAIN_RUNNING, 0.5, 10)
        self.state = VM_STATE_NAMES.get(state_code, 'None')
        if state_code != libvirt.VIR_DOMAIN_RUNNING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Failed to start VM {
                    self.id}. Current state: {
                    self.state}",
            )
        self.ipv4 = get_vm_ip(str(self.id))
        return self

    def stop(self):
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(str(self.id))
            if vm.isActive() == 1:
                vm.shutdown()
        except libvirt.libvirtError as e:
            if e.get_error_code() == libvirt.VIR_ERR_NO_DOMAIN:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f'Vm {self.id} not found')
        except Exception:
            raise
        state_code = wait_for_state(vm, libvirt.VIR_DOMAIN_SHUTOFF, 5, 10)
        self.state = VM_STATE_NAMES.get(state_code, 'None')
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
        location = StorageService.get(self.storage_id)
        with StorageService.lock(location):
            self._remove()

    def _remove(self):
        # Validate the recorded location before changing libvirt or database state.
        vm_dir = StorageService.vm_dir(self.storage_id, self.id)
        self.stop()
        conn = QEMUConfig.get_connection()
        domain = conn.lookupByName(str(self.id))
        if domain.isActive():
            raise HTTPException(
                409, "Wait for the VM to stop before deleting it")
        domain.undefine()
        if vm_dir.exists():
            rmtree(vm_dir)

        with Session(engine) as session:
            session.exec(delete(EventParticipantORM).where(
                EventParticipantORM.vm_id == self.id))
            session.exec(delete(VmCredentialORM).where(
                VmCredentialORM.vm_id == self.id))
            session.exec(delete(VmORM).where(VmORM.id == self.id))
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
            record = VmService._get_vm_or_404(session, vm_id)
            data["ssh_enabled"] = record.ssh_enabled
            data["storage_id"] = record.storage_id
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
                VmORM.id)).where(
            VmORM.name.like(search_pattern))
        count = session.exec(statement).one()
        if count == 0:
            return base_name
        return f"{base_name}({count})"

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
                        data["storage_id"] = vm_record.storage_id
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
                    "storage_id": vm_record.storage_id,
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
                        "storage_id": vm_record.storage_id,
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

    def get_state(vm_id: str):
        vm = Vm.get(vm_id)
        state = vm.get_state()
        return state

    def create_vm(vm_create: VmCreate):
        Vm._resolve_image_name(vm_create.os)
        if vm_create.auto_place and vm_create.storage_id and not vm_create.slave_id:
            raise HTTPException(
                400, "Choose a host before choosing a storage location")
        if vm_create.slave_id:
            return VmService._create_vm_on_slave(vm_create)
        if vm_create.auto_place:
            slave_id = VmService._auto_pick_node(
                vm_create.mem, vm_create.vcpus, vm_create.disk_size
            )
            if slave_id:
                vm_create.slave_id = slave_id
                return VmService._create_vm_on_slave(vm_create)
        vm = Vm(vm_create)
        return vm

    @staticmethod
    def _auto_pick_node(
            required_mem: int,
            required_vcpus: int,
            required_disk: int):
        """Pick the best node, prioritizing master. Returns slave UUID or None for master."""
        from app.services.host_service import HostService
        from app.services.slave_service import SlaveService
        from app.services.slave_client import slave_get_host_info as _slave_get_host_info

        try:
            master = HostService.get_host_info()
            if (master.mem.available >= required_mem and
                    master.cpu.cpu_count >= required_vcpus and
                    master.disk.available >= required_disk):
                return None
        except Exception:
            pass

        best_slave = None
        best_mem = -1
        for slave in SlaveService.get_online_slaves():
            try:
                info = _slave_get_host_info(slave)
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

        if best_slave:
            return best_slave.id
        raise HTTPException(
            507, "No available host has enough memory, CPU and storage for this VM")

    @staticmethod
    def _create_vm_on_slave(vm_create: VmCreate):
        """Create a VM on a slave node."""
        from app.services.slave_client import slave_create_vm
        from app.services.slave_service import SlaveService

        slave = SlaveService.get_slave(str(vm_create.slave_id))
        if slave.status != "online":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Slave {slave.name} is not online",
            )

        payload = {
            "os": vm_create.os,
            "name": vm_create.name,
            "mem": vm_create.mem,
            "vcpus": vm_create.vcpus,
            "disk_size": vm_create.disk_size,
            "keyboard_layout": vm_create.keyboard_layout,
            "ssh_enabled": vm_create.ssh_enabled,
            "activate_at_start": vm_create.activate_at_start,
            "storage_id": vm_create.storage_id,
        }
        result = slave_create_vm(slave, payload)
        vm_id = result["id"]

        # Store a reference in the master DB
        with Session(engine) as session:
            vm_record = VmORM(
                id=uuid.UUID(vm_id) if isinstance(vm_id, str) else vm_id,
                name=vm_create.name,
                os=vm_create.os,
                mem=vm_create.mem,
                vcpus=vm_create.vcpus,
                disk_size=vm_create.disk_size,
                keyboard_layout=vm_create.keyboard_layout,
                ssh_enabled=vm_create.ssh_enabled,
                slave_id=slave.id,
                storage_id=result.get("storage_id", "default"),
            )
            session.add(vm_record)
            session.commit()

        result["slave_id"] = str(slave.id)
        result["slave_name"] = slave.name
        return result

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

    def stop_vm(vm_id: str):
        slave = VmService._get_slave_for_vm(vm_id)
        if slave:
            if slave.status != "online":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Slave {slave.name} is offline",
                )
            from app.services.slave_client import slave_stop_vm
            return VmService._with_slave_fields(
                slave_stop_vm(slave, vm_id), slave, vm_id)
        vm = Vm.get(vm_id)
        return vm.stop()

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
                        EventParticipantORM.vm_id == uuid.UUID(vm_id)
                    )
                )
                session.exec(
                    delete(VmCredentialORM).where(
                        VmCredentialORM.vm_id == uuid.UUID(vm_id)
                    )
                )
                session.exec(
                    delete(VmORM).where(VmORM.id == uuid.UUID(vm_id))
                )
                session.commit()
            return
        vm = Vm.get(vm_id)
        vm.remove()

    def restart_vm(vm_id):
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
                .order_by(VmCredentialORM.created_at)
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
                    VmCredentialORM.id == parsed_credential_id
                )
            )
            session.commit()

    @staticmethod
    def _recoverable_disks(storage_id: Optional[str] = None):
        locations = ([StorageService.get(storage_id)] if storage_id is not None
                     else StorageService.locations())
        with Session(engine) as session:
            for location in locations:
                try:
                    StorageService.get(location.id)
                except HTTPException:
                    # An unplugged pool must not hide recoverable VMs on other pools.
                    continue
                for directory in (location.path / "vms").iterdir():
                    if not directory.is_dir() or directory.is_symlink():
                        continue
                    try:
                        vm_id = uuid.UUID(directory.name)
                    except ValueError:
                        continue
                    if session.get(VmORM, vm_id) is not None:
                        continue
                    for image in directory.iterdir():
                        if image.is_file() and not image.is_symlink() and image.suffix == ".qcow2":
                            try:
                                StorageService.safe_image_name(image.name)
                            except HTTPException:
                                continue
                            yield location, directory, image.name

    @staticmethod
    def get_recoverable_vms() -> list[RecoverableVm]:
        recoverable_vms = []
        for location, directory, image_name in VmService._recoverable_disks():
            metadata_name = image_name.removesuffix(
                ".qcow2") + ".metadata.yaml"
            metadata_path = StorageService.images_dir(
                location.id) / metadata_name
            image_metadata = None
            if metadata_path.is_file() and not metadata_path.is_symlink():
                try:
                    image_metadata = ImageRead(
                        **yaml.safe_load(metadata_path.read_text()))
                except (ValueError, TypeError, yaml.YAMLError):
                    pass
            if image_metadata is None:
                image_metadata = ImageService.get_distribox_image(
                    metadata_name)
            if image_metadata is None:
                image_metadata = ImageRead(name=image_name, image=image_name,
                                           version="Unknown", distribution="Unknown",
                                           family="Unknown", revision=0)
            metadata = image_metadata.model_dump()
            metadata["image"] = image_name
            recoverable_vms.append(RecoverableVm(
                vm_id=directory.name, storage_id=location.id,
                storage_path=location.display_path, **metadata))
        return recoverable_vms

    @staticmethod
    def _recoverable_source(vm_id: str, storage_id: Optional[str] = None):
        normalized = str(VmService._parse_vm_id(vm_id))
        matches = [item for item in VmService._recoverable_disks(storage_id)
                   if item[1].name == normalized]
        if not matches:
            raise HTTPException(404, f"Recoverable VM {vm_id} not found")
        if len(matches) > 1:
            raise HTTPException(
                409, "Several disks match this VM; choose its storage location")
        return matches[0]

    @staticmethod
    def recover_vm(recoverable_vm: RecoverableVmCreate):
        location, directory, image_name = VmService._recoverable_source(
            str(recoverable_vm.vm_id), recoverable_vm.storage_id)
        vm_record = VmORM(
            id=recoverable_vm.vm_id, name=recoverable_vm.name, os=image_name,
            mem=recoverable_vm.mem, vcpus=recoverable_vm.vcpus,
            disk_size=recoverable_vm.disk_size, storage_id=location.id,
        )
        domain = None
        with StorageService.lock(location):
            directory = StorageService.vm_dir(
                location.id, recoverable_vm.vm_id)
            if (directory / "seed.iso").is_symlink():
                raise HTTPException(
                    409, "The VM seed must not be a symbolic link")
            with Session(engine) as session:
                if session.get(VmORM, vm_record.id) is not None:
                    raise HTTPException(
                        409, "This VM has already been recovered")
                conn = QEMUConfig.get_connection()
                try:
                    existing = conn.lookupByName(str(vm_record.id))
                except libvirt.libvirtError as exc:
                    if exc.get_error_code() != libvirt.VIR_ERR_NO_DOMAIN:
                        raise
                else:
                    from lxml import etree
                    source = etree.fromstring(existing.XMLDesc(0).encode()).find(
                        "./devices/disk[@device='disk']/source")
                    if source is None or source.get("file") != str(directory / image_name):
                        raise HTTPException(
                            409, "This VM is already defined with a different disk")
                try:
                    ensure_seed_iso(vm_dir=directory)
                    try:
                        conn.lookupByName(str(vm_record.id))
                    except libvirt.libvirtError as exc:
                        if exc.get_error_code() != libvirt.VIR_ERR_NO_DOMAIN:
                            raise
                        domain = conn.defineXML(
                            build_xml(VmCreateXML(**vm_record.model_dump())))
                    session.add(vm_record)
                    session.commit()
                except Exception:
                    if domain is not None:
                        domain.undefine()
                    raise
        return Vm.get(str(recoverable_vm.vm_id))

    @staticmethod
    def remove_recoverable_vm(vm_id: str, storage_id: Optional[str] = None):
        location, directory, image_name = VmService._recoverable_source(
            vm_id, storage_id)
        with StorageService.lock(location):
            # Recheck after taking the lock: recovery could have registered it meanwhile.
            with Session(engine) as session:
                if session.get(VmORM, VmService._parse_vm_id(vm_id)) is not None:
                    raise HTTPException(
                        409, "This VM is registered; delete it from the VM list")
            try:
                domain = QEMUConfig.get_connection().lookupByName(str(uuid.UUID(vm_id)))
            except libvirt.libvirtError as exc:
                if exc.get_error_code() != libvirt.VIR_ERR_NO_DOMAIN:
                    raise
            else:
                from lxml import etree
                source = etree.fromstring(domain.XMLDesc(0).encode()).find(
                    "./devices/disk[@device='disk']/source")
                if source is None or source.get("file") != str(directory / image_name):
                    raise HTTPException(
                        409, "This VM is defined with a different disk")
                if domain.isActive():
                    raise HTTPException(
                        409, "Stop or recover this VM before deleting its files")
                domain.undefine()
            rmtree(StorageService.vm_dir(location.id, vm_id))

    @staticmethod
    def remove_all_recoverable_vms():
        sources = {(location.id, directory.name)
                   for location, directory, _ in VmService._recoverable_disks()}
        for storage_id, vm_id in sources:
            VmService.remove_recoverable_vm(vm_id, storage_id)

    @staticmethod
    def duplicate_vm(vm_id: str):
        slave = VmService._get_slave_for_vm(vm_id)
        if slave:
            if slave.status != "online":
                raise HTTPException(409, f"Slave {slave.name} is offline")
            from app.services.slave_client import slave_request, VM_CREATE_TIMEOUT
            result = slave_request(slave, "POST", f"/vms/{vm_id}/duplicate",
                                   timeout=VM_CREATE_TIMEOUT)
            with Session(engine) as session:
                session.add(VmORM(**{
                    **VmRead(**result).model_dump(), "slave_id": slave.id,
                    "ssh_enabled": False,
                }))
                session.commit()
            result["slave_id"] = str(slave.id)
            result["slave_name"] = slave.name
            result["ssh_enabled"] = False
            return result

        with Session(engine) as session:
            source = VmService._get_vm_or_404(session, vm_id)
            image_name = StorageService.safe_image_name(source.os)
            location = StorageService.select(source.storage_id)
            source_directory = StorageService.vm_dir(location.id, source.id)
            source_image = source_directory / image_name
            if source_image.is_symlink() or not source_image.is_file():
                raise HTTPException(409, "The VM disk is unavailable")
            conn = QEMUConfig.get_connection()
            duplicate = VmORM(**{
                **source.model_dump(), "id": uuid.uuid4(), "ssh_enabled": False,
                "name": VmService._get_duplicate_name(session, source.name),
            })
            destination = StorageService.vm_dir(location.id, duplicate.id)
            domain = None
            created_directory = False
            try:
                with StorageService.lock(location):
                    if conn.lookupByName(str(source.id)).isActive():
                        raise HTTPException(
                            409, "Stop the VM before duplicating its disk")
                    StorageService.ensure_space(location, source.disk_size * 1024 ** 3 +
                                                source_image.stat().st_size)
                    destination.mkdir(exist_ok=False)
                    created_directory = True
                    copy(source_image, destination / image_name)
                    ensure_seed_iso(
                        keyboard_layout=source.keyboard_layout, vm_dir=destination)
                    domain = conn.defineXML(
                        build_xml(VmCreateXML(**duplicate.model_dump())))
                    session.add(duplicate)
                    session.commit()
            except Exception:
                session.rollback()
                if domain is not None:
                    domain.undefine()
                if created_directory:
                    rmtree(destination)
                raise
            return Vm.get(str(duplicate.id))

    @staticmethod
    def rename_vm(vm_id: str, vm_rename: VmRename):
        with Session(engine) as session:
            vm = VmService._get_vm_or_404(session, vm_id)
            vm.name = vm_rename.name
            session.add(vm)
            session.commit()
            return Vm.get(str(vm.id))
