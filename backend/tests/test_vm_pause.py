from unittest.mock import Mock
from time import time

import libvirt
import pytest
from xml.etree import ElementTree
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models.vm import VmRead
from app.orm.vm import VmORM
from app.services import vm_service
from app.services import ssh_guest, slave_client
from app.utils import vm as vm_utils


@pytest.fixture
def paused_vm(tmp_path, monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(vm_service, "engine", engine)
    monkeypatch.setattr(vm_service, "VMS_DIR", tmp_path)
    monkeypatch.setattr(vm_service, "get_vm_ip", lambda _: "192.168.122.42")
    monkeypatch.setattr(vm_service, "ensure_default_network", Mock())
    monkeypatch.setattr(vm_service, "ensure_seed_iso", Mock())
    monkeypatch.setattr(vm_service, "wait_for_state",
                        lambda vm, *args: vm.state()[0])
    record = VmORM(name="GLO-2000 Lab", os="lab.qcow2",
                   mem=4, vcpus=2, disk_size=20)
    with Session(engine) as session:
        session.add(record)
        session.commit()
        vm_id = str(record.id)
    (tmp_path / vm_id).mkdir()
    domain = Mock()
    domain.isActive.return_value = 1
    domain.state.return_value = (
        libvirt.VIR_DOMAIN_PAUSED, libvirt.VIR_DOMAIN_PAUSED_IOERROR)
    domain.diskErrors.return_value = {
        "vda": libvirt.VIR_DOMAIN_DISK_ERROR_NO_SPACE}
    domain.XMLDesc.return_value = "<domain><devices/></domain>"
    domain.resume.side_effect = lambda: setattr(
        domain.state, "return_value", (libvirt.VIR_DOMAIN_RUNNING, 0))
    domain.destroy.side_effect = lambda: setattr(
        domain.state, "return_value", (libvirt.VIR_DOMAIN_SHUTOFF, 0))
    connection = Mock()
    connection.lookupByName.return_value = domain
    monkeypatch.setattr(vm_service.QEMUConfig,
                        "get_connection", lambda: connection)
    yield vm_id, domain
    engine.dispose()


def test_vm_response_explains_the_pause(paused_vm):
    vm_id, _ = paused_vm
    response = VmRead.model_validate(vars(vm_service.VmService.get_vm(vm_id)))
    assert response.pause_reason == "Host disk full"


def test_start_resumes_the_existing_session_and_syncs_clock(paused_vm):
    vm_id, domain = paused_vm
    result = vm_service.VmService.start_vm(vm_id)
    assert result.state == "Running"
    assert result.pause_reason is None
    domain.resume.assert_called_once()
    domain.setTime.assert_called_once()
    assert abs(domain.setTime.call_args.args[0]["seconds"] - time()) < 5
    domain.create.assert_not_called()
    vm_service.ensure_seed_iso.assert_not_called()


def test_resume_that_pauses_again_explains_how_to_retry(paused_vm):
    vm_id, domain = paused_vm
    domain.resume.side_effect = None
    with pytest.raises(HTTPException) as error:
        vm_service.VmService.start_vm(vm_id)
    assert error.value.status_code == 409
    assert "Host disk full" in error.value.detail
    assert "Free space" in error.value.detail
    domain.setTime.assert_not_called()


def test_stop_powers_off_a_paused_vm_without_resuming_it(paused_vm):
    vm_id, domain = paused_vm
    result = vm_service.VmService.stop_vm(vm_id, force=True)
    assert result.state == "Stopped"
    assert result.pause_reason is None
    domain.destroy.assert_called_once()
    domain.shutdown.assert_not_called()
    domain.resume.assert_not_called()


def test_unconfirmed_stop_does_not_discard_a_paused_session(paused_vm):
    vm_id, domain = paused_vm
    with pytest.raises(HTTPException, match="Force stop"):
        vm_service.VmService.stop_vm(vm_id)
    domain.destroy.assert_not_called()


def test_disk_diagnostics_failure_keeps_vm_visible(paused_vm):
    vm_id, domain = paused_vm
    domain.diskErrors.side_effect = libvirt.libvirtError("not supported")
    result = vm_service.VmService.get_vm(vm_id)
    assert result.state == "Paused"
    assert result.pause_reason == "Disk I/O error"


def test_resume_refreshes_network_and_discards_cached_ssh_target(paused_vm, monkeypatch):
    vm_id, domain = paused_vm
    monkeypatch.setattr(vm_utils, "sleep", lambda _: None)
    domain.XMLDesc.return_value = """<domain><devices>
    <interface type='network'><mac address='52:54:00:12:34:56'/></interface>
    <interface type='network'><link state='down'/></interface>
    </devices></domain>"""
    ssh_guest._prepared[vm_id] = (1, 0, {"host": "old-address"})
    vm_service.VmService.start_vm(vm_id)
    links = [ElementTree.fromstring(call.args[0]).find("link").get("state")
             for call in domain.updateDeviceFlags.call_args_list]
    assert links == ["down", "up"]
    assert vm_id not in ssh_guest._prepared


def test_missing_guest_agent_does_not_hide_a_successful_resume(paused_vm):
    vm_id, domain = paused_vm
    domain.setTime.side_effect = libvirt.libvirtError(
        "guest agent disconnected")
    result = vm_service.VmService.start_vm(vm_id)
    assert result.state == "Running"
    assert "clock" in result.recovery_warning
    assert "console" in result.recovery_warning


def test_force_stop_is_forwarded_to_the_slave(monkeypatch):
    request = Mock(return_value={"state": "Stopped"})
    monkeypatch.setattr(slave_client, "slave_request", request)
    slave_client.slave_stop_vm(Mock(), "test-vm", force=True)
    assert request.call_args.args[2] == "/vms/test-vm/stop?force=true"
