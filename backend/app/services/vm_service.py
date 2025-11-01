import uuid
import shutil
from typing import Optional
from app.core.constants import VMS_DIR, IMAGES_DIR
from app.models.vm import VmCreate, VmRead
from app.core.xml_builder import build_xml
from app.core.config import get_connection

class Vm:
    def __init__(self, vm_create: VmCreate):
        self.id = str(uuid.uuid4())
        self.os = vm_create.os
        self.mem = vm_create.mem
        self.vcpus = vm_create.vcpus
        self.disk_size = vm_create.disk_size
        self.status: Optional[str] = None
    
    def create(self):
        if self.status :
            return self
        self.status = 'Not Running'
        vm_dir = VMS_DIR / self.id
        distribox_image_dir = IMAGES_DIR / f"distribox-{self.os}.qcow2"
        try: 
            vm_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy(distribox_image_dir, vm_dir)
            vm_xml = build_xml(self)
            conn = get_connection()
            conn.defineXML(vm_xml)
            conn.close()
            return self
        except conn is None:
            raise("Couldn't connect to qemu")
        except Exception as e:
            raise(e)
    


class VmService:
    def create_vm(vm_create: VmCreate):
        vm = Vm(vm_create)
        try: 
            vm.create()
            return vm
        except Exception as e:
            raise(e)
    
    def start_vm(vm_name: str):
        try:
            conn = get_connection()
            vm = conn.lookupByName(vm_name)
            vm.create()
            conn.close
            # update status in db and return updated vm
            #return
        except Exception as e:
            raise(e) 
            
        
