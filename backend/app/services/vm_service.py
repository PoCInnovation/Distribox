import uuid
import shutil
import libvirt
from app.utils.vm import wait_for_state
from typing import Optional
from app.core.constants import VMS_DIR, IMAGES_DIR, VM_STATE_NAMES
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
        self.state: Optional[str] = None
    


    def create(self):
        if self.state :
            return self
        self.state = 'Stopped'
        vm_dir = VMS_DIR / str(self.id)
        distribox_image_dir = IMAGES_DIR / f"distribox-{self.os}.qcow2"
        try:
            vm_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy(distribox_image_dir, vm_dir)
            vm_xml = build_xml(self)
            conn = QEMUConfig.get_connection()
            conn.defineXML(vm_xml)
            with Session(engine) as session:
                vm_record = VmORM(
                    id = self.id,
                    os = self.os,
                    mem = self.mem,
                    vcpus = self.vcpus,
                    disk_size= self.disk_size,
                )
                session.add(vm_record)
                session.commit()
            return self
        except Exception as e:
            print(e)
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
                    raise Exception('Not found')
                vm_instance = cls.__new__(cls)
                vm_instance.id = vm_record.id
                vm_instance.os = vm_record.os
                vm_instance.mem = vm_record.mem
                vm_instance.vcpus = vm_record.vcpus
                vm_instance.disk_size =vm_record.disk_size
            vm_instance.state = VM_STATE_NAMES.get(vm_state, 'None')
        except Exception:
            raise
        return vm_instance

    def start(self):
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(str(self.id))
            if vm.isActive() == 0:
                vm.create()
        except Exception:
            raise
        state_code = wait_for_state(vm, libvirt.VIR_DOMAIN_RUNNING, 0.5, 10)
        self.state=VM_STATE_NAMES.get(state_code, 'None')
        return self
    
    def stop(self):
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(str(self.id))
            if vm.isActive() == 1:
                vm.shutdown()
        except Exception:
            raise
        state_code = wait_for_state(vm, libvirt.VIR_DOMAIN_SHUTOFF, 5, 10)
        self.state=VM_STATE_NAMES.get(state_code, 'None')
        return self
    
    def get_state(self):
        try:
            conn = QEMUConfig.get_connection()
            vm = conn.lookupByName(str(self.id))
            state, _ = vm.state()
        except Exception:
            raise
        return {"state" : VM_STATE_NAMES.get(state, 'None')}
    
class VmService:
    def get_vm(vm_id: str):
        try:
            vm = Vm.get(vm_id)
            return vm
        except Exception:
            raise

    def get_state(vm_id:str):
        try:
            print('hello')
            vm = Vm.get(vm_id)
            state = vm.get_state()
            return state
        except Exception:
            raise

    def create_vm(vm_create: VmCreate):
        vm = Vm(vm_create)
        try: 
            vm.create()
            return vm
        except Exception:
            raise

    def start_vm(vm_id: str):
        try:
            vm = Vm.get(vm_id)
            return vm.start()
        except Exception:
            raise
    def stop_vm(vm_id: str):
        try:
            vm = Vm.get(vm_id)
            return vm.stop()
        except Exception:
            raise
