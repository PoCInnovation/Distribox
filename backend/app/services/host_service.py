import shutil
import psutil
from app.models.host import HostInfoBase
from app.services.vm_service import VmService
from app.core.config import system_monitor


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
            "distribox_used": sum([
                vm.disk_size if hasattr(
                    vm, "disk_size") else vm.get("disk_size", 0)
                for vm in VmService.get_vm_list()
            ])
        }
        mem = {
            "total": round(mem_usage.total / 2**30, 2),
            "used": round(mem_usage.used / 2**30, 2),
            "available": round(mem_usage.available / 2**30, 2),
            "percent_used": mem_usage.percent
        }
        cpu = system_monitor.cpu
        host_info = HostInfoBase(disk=disk, mem=mem, cpu=cpu)
        return host_info
