import uuid
import shutil
from typing import Optional
from app.core.constants import VMS_DIR, IMAGES_DIR
from app.models.vm import VmCreate, VmRead
from app.core.xml_builder import build_xml
from app.core.config import QEMUConfig, engine
from sqlmodel import Session
from app.orm.vm import VmORM

class Vm:
    def __init__(self, vm_create: VmCreate):
        self.id = uuid.uuid4()
        self.os = vm_create.os
        self.mem = vm_create.mem
        self.vcpus = vm_create.vcpus
        self.disk_size = vm_create.disk_size
        self.status: Optional[str] = None

    @classmethod
    def get(cls, vm_id: str):
        try: 
            vm_uid = uuid.UUID(vm_id)
            with Session(engine) as session:
                vm_record = session.get(VmORM, vm_uid)
                if not vm_record: 
                    raise Exception('Not found')
                vm_instance = cls.__new__(cls)
                vm_instance.id = vm_record.id
                vm_instance.os = vm_record.os
                vm_instance.mem = vm_record.mem
                vm_instance.vcpus = vm_record.vcpus
                vm_instance.disk_size =vm_record.disk_size
                vm_instance.status = vm_record.status
        except Exception:
            raise
        return vm_instance
            

    def create(self):
        if self.status :
            return self
        self.status = 'stopped'
        vm_dir = VMS_DIR / str(self.id)
        distribox_image_dir = IMAGES_DIR / f"distribox-{self.os}.qcow2"
        try:
            vm_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy(distribox_image_dir, vm_dir)
            vm_xml = build_xml(self)
            conn = QEMUConfig.get_connection()
            conn.defineXML(vm_xml)
            conn.close()
            with Session(engine) as session:
                vm_record = VmORM(
                    id = self.id,
                    os = self.os,
                    mem = self.mem,
                    vcpus = self.vcpus,
                    disk_size= self.disk_size,
                    status= self.status
                )
                session.add(vm_record)
                session.commit()
            return self
        except Exception as e:
            print(e)
            raise
    
class VmService:
    def get_vm(vm_id: str):
        try:
            vm = Vm.get(vm_id)
        except Exception:
            raise
        return vm
    def create_vm(vm_create: VmCreate):
        vm = Vm(vm_create)
        try: 
            vm.create()
            return vm
        except Exception:
            raise
        
