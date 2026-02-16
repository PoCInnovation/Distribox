from threading import Thread
from collections import Counter
from time import sleep
from libvirt import VIR_DOMAIN_STATS_CPU_TOTAL, VIR_DOMAIN_STATS_INTERFACE, VIR_CONNECT_GET_ALL_DOMAINS_STATS_RUNNING, libvirtError
import psutil


class CPUStateSnapshot:
    def __init__(self, cpu_state_snapshot):
        self.cpu_state_snapshot = cpu_state_snapshot
        if hasattr(cpu_state_snapshot, "_asdict"):
            data = cpu_state_snapshot._asdict().values()
        elif hasattr(cpu_state_snapshot, "values"):
            data = cpu_state_snapshot.values()
        else:
            data = cpu_state_snapshot
        self.total_time = sum(data)
        self.active_time = self.total_time - self.cpu_state_snapshot.idle


class SystemMonitor:
    def __init__(self, interval, get_connection):
        self.get_connection = get_connection
        self.interval = interval
        self.cpu = {
            "percent_used_total": 0,
            "percent_used_per_cpu": [],
            "percent_used_per_vm": [],
            "percent_used_total_vms": 0,
            "cpu_count": 0
        }
        self.cpu_counter = {}
        self._thread = Thread(target=self._update_loop, daemon=True).start()

    def _get_running_vms(self):
        try:
            conn = self.get_connection()
            return conn.getAllDomainStats(
                stats=VIR_DOMAIN_STATS_CPU_TOTAL | VIR_DOMAIN_STATS_INTERFACE,
                flags=VIR_CONNECT_GET_ALL_DOMAINS_STATS_RUNNING)
        except (libvirtError, Exception):
            return []

    def _get_cpu_counters(self):
        per_cpus_counter = [
            CPUStateSnapshot(cpu_times) for cpu_times in psutil.cpu_times(
                percpu=True)]
        cpu_total_counter = Counter()
        for cpu in per_cpus_counter:
            cpu_total_counter.update(cpu.cpu_state_snapshot._asdict())

        stats = self._get_running_vms()
        per_vm_counter = (
            {"id": s[0].name(), "cpu_time": s[1]["cpu.time"] / 100000000} for s in stats)
        return {
            "per_cpus_counter": per_cpus_counter,
            "cpu_total_counter": CPUStateSnapshot(
                psutil._pslinux.scputimes(
                    **cpu_total_counter)),
            "per_vm_counter": per_vm_counter}

    def _get_cpu_usage_percent(self, a, b, x, y):
        return 1 * (((a - b) / (x - y)) * 100)

    def _update_loop(self):
        self.cpu["cpu_count"] = psutil.cpu_count()
        while True:
            cpu_usage_t1 = self._get_cpu_counters()
            sleep(3)
            cpu_usage_t2 = self._get_cpu_counters()

            self.cpu["percent_used_total"] = self._get_cpu_usage_percent(
                cpu_usage_t2["cpu_total_counter"].active_time,
                cpu_usage_t1["cpu_total_counter"].active_time,
                cpu_usage_t2["cpu_total_counter"].total_time,
                cpu_usage_t1["cpu_total_counter"].total_time)

            self.cpu["percent_used_per_cpu"] = []
            for i in range(len(cpu_usage_t1["per_cpus_counter"])):
                self.cpu["percent_used_per_cpu"].append(
                    round(
                        self._get_cpu_usage_percent(
                            cpu_usage_t2["per_cpus_counter"][i].active_time,
                            cpu_usage_t1["per_cpus_counter"][i].active_time,
                            cpu_usage_t2["per_cpus_counter"][i].total_time,
                            cpu_usage_t1["per_cpus_counter"][i].total_time),
                        2))

            self.cpu["percent_used_per_vm"] = []
            for vm_counter_t1 in cpu_usage_t1["per_vm_counter"]:
                vm_counter_t2 = next(
                    (vm for vm in cpu_usage_t2["per_vm_counter"]
                     if vm["id"] == vm_counter_t1["id"]),
                    None)
                if vm_counter_t2 is None:
                    continue
                self.cpu["percent_used_per_vm"].append(
                    {
                        "id": vm_counter_t1["id"],
                        "cpu_percentage": round(
                            self._get_cpu_usage_percent(
                                vm_counter_t2["cpu_time"],
                                vm_counter_t1["cpu_time"],
                                cpu_usage_t2["cpu_total_counter"].total_time,
                                cpu_usage_t1["cpu_total_counter"].total_time),
                            2)})

            self.cpu["percent_used_total_vms"] = sum(
                (vm["cpu_percentage"] for vm in self.cpu["percent_used_per_vm"]))
