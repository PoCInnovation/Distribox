from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import libvirt
import pytest
from fastapi import HTTPException

from app.services import vm_service


@pytest.fixture
def host(monkeypatch, tmp_path):
    domain = Mock()
    domain.isActive.return_value = 1
    connection = Mock()
    connection.lookupByName.return_value = domain
    recoverable = []
    monkeypatch.setattr(vm_service.QEMUConfig, "get_connection",
                        lambda: connection)
    monkeypatch.setattr(vm_service, "VMS_DIR", tmp_path)
    monkeypatch.setattr(vm_service.VmService, "get_recoverable_vms", lambda: [
        SimpleNamespace(vm_id=name) for name in recoverable
    ])
    return SimpleNamespace(domain=domain, connection=connection,
                           vms_dir=tmp_path, recoverable=recoverable)


def libvirt_error(code):
    error = libvirt.libvirtError("libvirt error")
    error.err = (code,)
    return error


def vm_dir(host, recoverable=True):
    directory = host.vms_dir / str(uuid4())
    directory.mkdir()
    if recoverable:
        host.recoverable.append(directory.name)
    return directory


@pytest.mark.parametrize("active", [0, 1])
def test_clean_destroys_and_undefines_domain(host, active):
    host.domain.isActive.return_value = active
    directory = vm_dir(host)
    vm_service.VmService.remove_recoverable_vm(directory.name)
    host.connection.lookupByName.assert_called_once_with(directory.name)
    assert host.domain.destroy.called == bool(active)
    host.domain.undefineFlags.assert_called_once_with(
        libvirt.VIR_DOMAIN_UNDEFINE_NVRAM)
    assert not directory.exists()


def test_clean_removes_folder_when_domain_is_missing(host):
    host.connection.lookupByName.side_effect = libvirt_error(
        libvirt.VIR_ERR_NO_DOMAIN)
    directory = vm_dir(host)
    vm_service.VmService.remove_recoverable_vm(directory.name)
    assert not directory.exists()


def test_clean_keeps_folder_when_libvirt_fails(host):
    host.connection.lookupByName.side_effect = libvirt_error(
        libvirt.VIR_ERR_NO_CONNECT)
    directory = vm_dir(host)
    with pytest.raises(libvirt.libvirtError):
        vm_service.VmService.remove_recoverable_vm(directory.name)
    assert directory.exists()


def test_clean_rejects_tracked_vm(host):
    tracked = vm_dir(host, recoverable=False)
    recoverable = vm_dir(host)
    with pytest.raises(HTTPException) as error:
        vm_service.VmService.remove_recoverable_vm(tracked.name)
    assert error.value.status_code == 404
    host.connection.lookupByName.assert_not_called()
    assert tracked.exists()
    vm_service.VmService.remove_recoverable_vm(recoverable.name)
    host.connection.lookupByName.assert_called_once_with(recoverable.name)
    assert not recoverable.exists()


def test_clean_all_undefines_only_recoverable_domains(host, monkeypatch):
    recoverable = [vm_dir(host), vm_dir(host)]
    kept = vm_dir(host)
    monkeypatch.setattr(vm_service.VmService, "get_recoverable_vms", lambda: [
        SimpleNamespace(vm_id=directory.name) for directory in recoverable
    ])
    vm_service.VmService.remove_all_recoverable_vms()
    looked_up = {call.args[0]
                 for call in host.connection.lookupByName.call_args_list}
    assert looked_up == {directory.name for directory in recoverable}
    assert host.domain.undefineFlags.call_count == 2
    assert [path.name for path in host.vms_dir.iterdir()] == [kept.name]
