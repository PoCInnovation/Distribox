import shutil
import psutil
from app.core.config import QEMUConfig
from threading import Thread
from app.models.host import HostInfoBase
from app.services.vm_service import VmService
import libvirt
import xml.etree.ElementTree as ET



cpu_total_usage = 0
usage_per_cpu = []

def get_cpu_usage():
    global cpu_total_usage, usage_per_cpu
    while True:
        cores = psutil.cpu_percent(interval=3, percpu=True)
        usage_per_cpu = cores
        cpu_total_usage = round(sum(cores) / len(cores), 2)


Thread(target=get_cpu_usage, daemon=True).start()

class HostService:

    @staticmethod
    def get_host_info():
        disk_usage = shutil.disk_usage("/")
        mem_usage = psutil.virtual_memory()
        
        disk = {
            "total": round(disk_usage.total / 2**30, 2),
            "used": round(disk_usage.used / 2**30, 2),
            "available": round(disk_usage.free / 2**30, 2),
            "percent_used": round((disk_usage.used / disk_usage.total) * 100, 2),
            "distribox_used": sum([vm.disk_size for vm in VmService.get_vm_list()])
        }
        mem = {
            "total": round(mem_usage.total / 2**30, 2),
            "used": round(mem_usage.used / 2**30, 2),
            "available": round(mem_usage.available / 2**30, 2),
            "percent_used": mem_usage.percent
        }
        cpu = {
            "percent_used_total": cpu_total_usage,
            "percent_used_per_cpu": usage_per_cpu,
            "cpu_count": len(usage_per_cpu)
        }
        host_info = HostInfoBase(disk=disk, mem=mem, cpu=cpu)
        return host_info
