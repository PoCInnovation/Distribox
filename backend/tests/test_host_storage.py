from pathlib import Path
from types import SimpleNamespace

from app.core.constants import BASE_DIR
from app.services import host_service


def test_host_capacity_uses_vm_storage_when_system_disk_is_low(monkeypatch):
    gib = 2**30
    system_disk = SimpleNamespace(total=250 * gib, used=240 * gib, free=10 * gib)
    storage_disk = SimpleNamespace(total=800 * gib, used=200 * gib, free=600 * gib)
    monkeypatch.setattr(
        host_service.shutil, "disk_usage",
        lambda path: storage_disk if Path(path) == BASE_DIR else system_disk,
    )
    monkeypatch.setattr(host_service.VmService, "get_vm_list", lambda: [])
    monkeypatch.setattr(host_service.psutil, "virtual_memory", lambda: SimpleNamespace(
        total=16 * gib, used=4 * gib, available=12 * gib, percent=25,
    ))
    monkeypatch.setattr(host_service.system_monitor, "cpu", {
        "percent_used_total": 0,
        "percent_used_per_cpu": [0],
        "percent_used_per_vm": [],
        "percent_used_total_vms": 0,
        "cpu_count": 1,
    })

    disk = host_service.HostService.get_host_info().disk

    assert disk.total == 800
    assert disk.used == 200
    assert disk.available == 600
    assert disk.percent_used == 25
