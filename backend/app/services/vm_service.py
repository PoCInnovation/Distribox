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
    def create_vm(vm_create: VmCreate):
        vm = Vm(vm_create)
        try: 
            vm.create()
            return vm
        except Exception as e:
            raise
        
