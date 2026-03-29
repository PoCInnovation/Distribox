import uuid
import subprocess
import logging
from shutil import copy, rmtree
import libvirt
from app.utils.vm import wait_for_state
from typing import Optional
from app.core.constants import VMS_DIR, IMAGES_DIR, VM_STATE_NAMES
from app.models.vm import VmCreate, VmRead, VmCredentialCreateRequest, RecoverableVm, RecoverableVmCreate, VmCreateXML, VmRename
from app.models.image import ImageRead
from app.core.xml_builder import build_xml
from app.core.config import QEMUConfig, engine
from sqlalchemy import func
from sqlmodel import Session, select, delete
from app.orm.vm import VmORM
from app.orm.vm_credential import VmCredentialORM
from app.orm.slave import SlaveORM
from fastapi import status, HTTPException
from app.utils.vm import get_vm_ip
from app.utils.crypto import decrypt_secret, encrypt_secret
from app.utils.seed import ensure_seed_iso
from app.core.config import s3, distribox_bucket_registry
from os import path
from app.services.image_service import ImageService
import yaml
from pathlib import Path
from sqlalchemy.orm import make_transient

logger = logging.getLogger(__name__)


class Vm:
    @staticmethod
    def _resolve_image_name(os_value: str) -> str:
        if not os_value.endswith(".qcow2"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid image '{os_value}': expected .qcow2 image",
            )
        return os_value

    @staticmethod
    def has_revision_changed(metadata_filename: str) -> bool:
        if (path.exists(IMAGES_DIR / metadata_filename) is False):
            return True

        metadata_file = s3.get_object(
            Bucket=distribox_bucket_registry,
            Key=metadata_filename)
        file_content = metadata_file["Body"].read().decode("utf-8")

        metadata = yaml.safe_load(file_content)
        local_metadata = yaml.safe_load(
            (IMAGES_DIR /
             metadata_filename).read_text(
                encoding="utf-8"))

        revision = metadata["revision"]
        local_revision = local_metadata["revision"]
        if (revision != local_revision):
            return True
        return False

    def __init__(self, vm_create: VmCreate):
        self.id = uuid.uuid4()
        self.name = vm_create.name
        self.os = self._resolve_image_name(vm_create.os)
        self.mem = vm_create.mem
        self.vcpus = vm_create.vcpus
        self.disk_size = vm_create.disk_size
        self.keyboard_layout = vm_create.keyboard_layout
        self.state: Optional[str] = None
        self.state = 'Stopped'
        self.ipv4: Optional[str] = None
        self.credentials_count: int = 0

        vm_dir = VMS_DIR / str(self.id)
        distribox_image_dir = IMAGES_DIR / self.os

        metadata_filename = self.os.replace("qcow2", "metadata.yaml")
        if (self.has_revision_changed(metadata_filename) is True):
            s3.download_file(
                distribox_bucket_registry,
                metadata_filename,
                IMAGES_DIR / metadata_filename)
        try:
            if (path.exists(distribox_image_dir)
                    is False or self.has_revision_changed is True):
                s3.download_file(
                    distribox_bucket_registry,
                    self.os,
                    distribox_image_dir)

            vm_dir.mkdir(parents=True, exist_ok=True)
            ensure_seed_iso(
                keyboard_layout=self.keyboard_layout,
                vm_dir=vm_dir,
            )
            copy(distribox_image_dir, vm_dir)
            vm_path = vm_dir / self.os
            subprocess.run(
                ["qemu-img", "resize", vm_path, f"+{self.disk_size}G"],
                check=True,
            )
            vm_xml = build_xml(VmCreateXML(
                id=self.id,
                os=self.os,
                name=self.name,
                mem=self.mem,
                vcpus=self.vcpus,
                disk_size=self.disk_size
            ))
            conn = QEMUConfig.get_connection()
            conn.defineXML(vm_xml)
            with Session(engine) as session:
                vm_record = VmORM(
                    id=self.id,
                    name=self.name,
                    os=self.os,
                    mem=self.mem,
                    vcpus=self.vcpus,
                    disk_size=self.disk_size,
                    keyboard_layout=self.keyboard_layout,
                    slave_id=getattr(vm_create, 'slave_id', None),
                )
                session.add(vm_record)
                session.commit()
            if vm_create.activate_at_start is True:
                self.start()
        except Exception:
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
                vm_instance.keyboard_layout = vm_record.keyboard_layout
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
        vm_dir = VMS_DIR / str(self.id)
        per_vm_seed = vm_dir / "seed.iso"
        if not per_vm_seed.exists():
            ensure_seed_iso(
                keyboard_layout=self.keyboard_layout,
                vm_dir=vm_dir,
            )
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
        try:
            self.stop()
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(str(self.id))
            vm.undefine()
        except Exception:
            pass

        vm_dir = VMS_DIR / str(self.id)
        if vm_dir.exists():
            rmtree(vm_dir)

        with Session(engine) as session:
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
                        "keyboard_layout": vm_record.keyboard_layout,
                        "state": "Unknown",
                        "ipv4": None,
                        "credentials_count": 0,
                        "slave_id": str(slave.id),
                        "slave_name": slave.name,
                    }
            from app.services.slave_client import slave_get_vm
            data = slave_get_vm(slave, vm_id)
            data["slave_id"] = str(slave.id)
            data["slave_name"] = slave.name
            return data
        vm = Vm.get(vm_id)
        return vm

    def get_state(vm_id: str):
        vm = Vm.get(vm_id)
        state = vm.get_state()
        return state

    def create_vm(vm_create: VmCreate):
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

        return best_slave.id if best_slave else None

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
            "activate_at_start": vm_create.activate_at_start,
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
                slave_id=slave.id,
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
            data = slave_start_vm(slave, vm_id)
            data["slave_id"] = str(slave.id)
            data["slave_name"] = slave.name
            return data
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
            data = slave_stop_vm(slave, vm_id)
            data["slave_id"] = str(slave.id)
            data["slave_name"] = slave.name
            return data
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
            data = slave_start_vm(slave, vm_id)
            data["slave_id"] = str(slave.id)
            data["slave_name"] = slave.name
            return data
        vm = Vm.get(vm_id)
        vm.stop()
        return vm.start()

    @staticmethod
    def create_vm_credential(vm_id: str, payload: VmCredentialCreateRequest):
        with Session(engine) as session:
            vm_record = VmService._get_vm_or_404(session, vm_id)
            provided_password = payload.password.strip() if payload.password else ""
            credential_password = provided_password or str(uuid.uuid4())
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
    def get_recoverable_vms() -> list[RecoverableVm]:
        recoverable_vms = []
        vm_root = Path(VMS_DIR)
        with Session(engine) as session:
            for vm in vm_root.iterdir():
                vm_record = session.get(VmORM, uuid.UUID(vm.name))
                if vm_record is None:
                    for vm_file in vm.iterdir():
                        if vm_file.name.endswith(".qcow2"):
                            image_name = vm_file.name.replace(
                                ".qcow2", ".metadata.yaml")
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
        vm_root = Path(VMS_DIR)
        for v in vm_root.iterdir():
            if v.name == vm_id:
                rmtree(VMS_DIR / v.name)
                return
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Vm {vm_id} not found in database"
        )

    @staticmethod
    def remove_all_recoverable_vms():
        vms_to_delete = VmService.get_recoverable_vms()
        vm_root = Path(VMS_DIR)
        for v in vm_root.iterdir():
            for x in vms_to_delete:
                if v.name == str(x.vm_id):
                    rmtree(VMS_DIR / v.name)
                    break
        return

    @staticmethod
    def duplicate_vm(vm_id: str):
        with Session(engine) as session:
            vm_to_duplicate = VmService._get_vm_or_404(session, vm_id)
            duplicate_vm = VmORM(**vm_to_duplicate.model_dump())
            duplicate_vm.id = uuid.uuid4()
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
                conn.defineXML(vm_xml)
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
