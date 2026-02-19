import uuid
import subprocess
from shutil import copy, rmtree
import libvirt
from app.utils.vm import wait_for_state
from typing import Optional
from app.core.constants import VMS_DIR, IMAGES_DIR, VM_STATE_NAMES
from app.models.vm import VmCreate, VmCredentialCreateRequest
from app.core.xml_builder import build_xml
from app.core.config import QEMUConfig, engine
from sqlalchemy import func
from sqlmodel import Session, select, delete
from app.orm.vm import VmORM
from app.orm.vm_credential import VmCredentialORM
from fastapi import status, HTTPException
from app.utils.vm import get_vm_ip
from app.utils.crypto import decrypt_secret, encrypt_secret


class Vm:
    def __init__(self, vm_create: VmCreate):
        self.id = uuid.uuid4()
        self.name = vm_create.name
        self.os = vm_create.os
        self.mem = vm_create.mem
        self.vcpus = vm_create.vcpus
        self.disk_size = vm_create.disk_size
        self.state: Optional[str] = None
        self.state = 'Stopped'
        self.ipv4: Optional[str] = None
        self.credentials_count: int = 0
        vm_dir = VMS_DIR / str(self.id)
        distribox_image_dir = IMAGES_DIR / self.os
        try:
            vm_dir.mkdir(parents=True, exist_ok=True)
            copy(distribox_image_dir, vm_dir)
            vm_path = vm_dir / self.os
            subprocess.run(
                ["qemu-img", "resize", vm_path, f"+{self.disk_size}G"])
            vm_xml = build_xml(self)
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
                )
                session.add(vm_record)
                session.commit()
            if vm_create.activate_at_start is True:
                self.start()
        except Exception:
            raise
    # def create(self):

    @classmethod
    def get(cls, vm_id: str):
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(vm_id)
            vm_state, _ = vm.state()
            with Session(engine) as session:
                vm_record = session.get(VmORM, uuid.UUID(vm_id))
                vm_instance = cls.__new__(cls)
                vm_instance.id = vm_record.id
                vm_instance.name = vm_record.name
                vm_instance.os = vm_record.os
                vm_instance.mem = vm_record.mem
                vm_instance.vcpus = vm_record.vcpus
                vm_instance.disk_size = vm_record.disk_size
                vm_instance.state = VM_STATE_NAMES.get(vm_state, 'None')
                vm_instance.ipv4 = get_vm_ip(str(vm_instance.id))
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
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(str(self.id))
            if vm.isActive() == 0:
                vm.create()
        except libvirt.libvirtError as e:
            if e.get_error_code() == libvirt.VIR_ERR_NO_DOMAIN:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f'Vm {vm.id} not found')
        except Exception:
            raise
        state_code = wait_for_state(vm, libvirt.VIR_DOMAIN_RUNNING, 0.5, 10)
        self.state = VM_STATE_NAMES.get(state_code, 'None')
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
                                    f'Vm {vm.id} not found')
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
            vm_dir = VMS_DIR / str(self.id)
            rmtree(vm_dir)
            with Session(engine) as session:
                credentials_statement = delete(VmCredentialORM).where(
                    VmCredentialORM.vm_id == self.id
                )
                session.exec(credentials_statement)
                statement = delete(VmORM).where(VmORM.id == self.id)
                session.exec(statement)
                session.commit()
        except Exception:
            raise


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

    def get_vm_list():
        vm = Vm.get_all()
        return vm

    def get_vm(vm_id: str):
        vm = Vm.get(vm_id)
        return vm

    def get_state(vm_id: str):
        vm = Vm.get(vm_id)
        state = vm.get_state()
        return state

    def create_vm(vm_create: VmCreate):
        vm = Vm(vm_create)
        # vm.create()
        return vm

    def start_vm(vm_id: str):
        vm = Vm.get(vm_id)
        return vm.start()

    def stop_vm(vm_id: str):
        vm = Vm.get(vm_id)
        return vm.stop()

    def remove_vm(vm_id: str):
        vm = Vm.get(vm_id)
        vm.remove()

    @staticmethod
    def create_vm_credential(vm_id: str, payload: VmCredentialCreateRequest):
        with Session(engine) as session:
            vm_record = VmService._get_vm_or_404(session, vm_id)
            credential = VmCredentialORM(
                vm_id=vm_record.id,
                name=payload.name,
                password=encrypt_secret(payload.password),
            )
            session.add(credential)
            session.commit()
            session.refresh(credential)
            return {
                "id": credential.id,
                "vm_id": credential.vm_id,
                "name": credential.name,
                "password": payload.password,
                "created_at": credential.created_at,
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
                }
                for credential in credentials
            ]

    @staticmethod
    def get_vm_credential(vm_id: str, credential_id: str):
        with Session(engine) as session:
            vm_record = VmService._get_vm_or_404(session, vm_id)
            parsed_credential_id = VmService._parse_credential_id(credential_id)
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
            }

    @staticmethod
    def revoke_vm_credential(vm_id: str, credential_id: str):
        with Session(engine) as session:
            vm_record = VmService._get_vm_or_404(session, vm_id)
            parsed_credential_id = VmService._parse_credential_id(credential_id)
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
