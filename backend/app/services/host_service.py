import shutil
import psutil
from app.core.config import QEMUConfig
from threading import Thread
from app.models.host import HostInfoBase
from app.services.vm_service import VmService
import libvirt
from time import sleep
from collections import Counter
from app.core.config import system_monitor

# cpu_total_usage = 0
# usage_per_cpu = []

# def get_cpu_usage_percent(cpu_idle_time_t2, cpu_idle_time_t1, cpu_total_time_t2, cpu_total_time_t1):
#     return (1 - (cpu_idle_time_t2 - cpu_idle_time_t1)/ (sum(cpu_total_time_t2) - sum(cpu_total_time_t1))) * 100

# def get_cpu_counters():
#     per_cpus = psutil.cpu_times(percpu=True)
#     total = Counter()
#     for cpu in per_cpus:
#         total.update(cpu._asdict())
#     cpu_total = psutil.cpu_times()
#     return {
#         "per_cpus": per_cpus,
#         "cpu_total": cpu_total
#     }

# def get_cpu_usage():
#     global cpu_total_usage, usage_per_cpu
#     while True:
#       cpu_usage_t1 = get_cpu_counters()
#       sleep(3)
#       cpu_usage_t2 = get_cpu_counters()
#       cpu_total_usage = get_cpu_usage_percent(cpu_usage_t2["cpu_total"].idle, cpu_usage_t1["cpu_total"].idle, cpu_usage_t2["cpu_total"], cpu_usage_t1["cpu_total"])
#       usage_per_cpu = []
#       for i in range(len(cpu_usage_t1["per_cpus"])):
#           usage_per_cpu.append(round(get_cpu_usage_percent(cpu_usage_t2["per_cpus"][i].idle, cpu_usage_t1["per_cpus"][i].idle, cpu_usage_t2["per_cpus"][i], cpu_usage_t1["per_cpus"][i]), 2)) 


# Thread(target=get_cpu_usage, daemon=True).start()

conn = QEMUConfig.get_connection()
stats = conn.getAllDomainStats(stats = libvirt.VIR_DOMAIN_STATS_CPU_TOTAL | libvirt.VIR_DOMAIN_STATS_INTERFACE,
    flags = libvirt.VIR_CONNECT_GET_ALL_DOMAINS_STATS_RUNNING)

for s in stats:
    print('lol')
    print(s[0].name(), s[1])

# cpu_overall_time_t1 = psutil.cpu_times(percpu=True)
# cpu_total_time_t1 = psutil.cpu_times()
# print(sum(cpu_total_time_t1))
# cpu_idle_time_t1 = cpu_total_time_t1.idle


# sleep(3)
# cpu_total_time_t2 = psutil.cpu_times()
# cpu_idle_time_t2 = cpu_total_time_t2.idle

# percent_used = (1 - (cpu_idle_time_t2 - cpu_idle_time_t1)/ (sum(cpu_total_time_t2) - sum(cpu_total_time_t1))) * 100
# print(percent_used)
# print(psutil.cpu_percent(interval=1))
# print(sum(psutil.cpu_times(percpu=True)))


# print(psutil.cpu_times_percent(interval=2))


# for dom_stats in stats:
#     data = dom_stats[1]
#     print(data.get('cpu.system'))

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
        cpu = system_monitor.cpu
        host_info = HostInfoBase(disk=disk, mem=mem, cpu=cpu)
        return host_info
