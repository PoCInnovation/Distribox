import shutil
import psutil
from app.models.host import HostInfoBase
from app.services.vm_service import VmService
from app.core.config import system_monitor
from app.services.storage_service import StorageService


class HostService:

    @staticmethod
    def get_host_info():
        overview = StorageService.overview()
        location = next((location for location in overview["locations"]
                         if location["id"] == overview["recommended_id"]), None)
        disk_usage = shutil.disk_usage(StorageService.get(
            location["id"]).path) if location else None
        mem_usage = psutil.virtual_memory()

        disk = {
            "total": round(disk_usage.total / 2**30, 2) if disk_usage else 0,
            "used": round(disk_usage.used / 2**30, 2) if disk_usage else 0,
            "available": round(disk_usage.free / 2**30, 2) if disk_usage else 0,
            "percent_used": round((disk_usage.used / disk_usage.total) * 100, 2) if disk_usage else 0,
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
