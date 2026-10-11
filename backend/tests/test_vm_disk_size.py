import json
import subprocess
from unittest.mock import Mock

import pytest
import libvirt
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

from app.models.vm import VmCreate
from app.services import vm_service


@pytest.fixture
def qemu_img(tmp_path, monkeypatch):
    (tmp_path / "test.qcow2").write_bytes(b"")
    monkeypatch.setattr(vm_service, "IMAGES_DIR", tmp_path)
    monkeypatch.setattr(vm_service, "VMS_DIR", tmp_path / "vms")
    monkeypatch.setattr(vm_service.Vm, "has_revision_changed",
                        staticmethod(lambda metadata_filename: False))
    monkeypatch.setattr(vm_service, "ensure_seed_iso", Mock())
    qemu_config = Mock()
    connection = qemu_config.get_connection.return_value
    connection.getLibVersion.return_value = 8_004_000
    connection.getVersion.return_value = 6_001_000
    connection.domainXMLToNative.return_value = "qemu-argv"
    monkeypatch.setattr(vm_service, "QEMUConfig", qemu_config)
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(vm_service, "engine", engine)
    run = Mock(return_value=subprocess.CompletedProcess(
        [], 0, json.dumps({"virtual-size": 9 * 2**30})))
    monkeypatch.setattr(vm_service.subprocess, "run", run)
    yield run
    engine.dispose()


def create_vm(disk_size):
    return vm_service.Vm(VmCreate(
        name="VM", os="test.qcow2", mem=2, vcpus=1, disk_size=disk_size,
        activate_at_start=False,
    ))


@pytest.mark.parametrize("disk_size", [9, 20])
def test_disk_is_resized_to_requested_size(tmp_path, qemu_img, disk_size):
    vm = create_vm(disk_size)

    assert qemu_img.call_args.args[0] == [
        "qemu-img", "resize", tmp_path / "vms" / str(vm.id) / "test.qcow2",
        f"{disk_size}G"]


def test_disk_smaller_than_image_is_rejected(tmp_path, qemu_img):
    with pytest.raises(HTTPException) as error:
        create_vm(8)

    assert error.value.status_code == 400
    assert error.value.detail == "Disk size must be at least 9 GB"
    assert qemu_img.call_count == 1
    assert not (tmp_path / "vms").exists()


@pytest.mark.parametrize("libvirt_version,qemu_version", [
    (8_003_999, 6_001_000), (8_004_000, 6_000_999), (0, 0),
])
def test_creation_omits_clipboard_on_older_hosts(
        qemu_img, libvirt_version, qemu_version):
    connection = vm_service.QEMUConfig.get_connection.return_value
    connection.getLibVersion.return_value = libvirt_version
    connection.getVersion.return_value = qemu_version

    create_vm(9)

    xml = connection.defineXML.call_args.args[0]
    assert "org.qemu.guest_agent.0" in xml
    assert "qemu-vdagent" not in xml


def test_creation_enables_clipboard_on_supported_host(qemu_img):
    connection = vm_service.QEMUConfig.get_connection.return_value

    create_vm(9)

    assert "qemu-vdagent" in connection.defineXML.call_args.args[0]


def test_duplication_omits_clipboard_on_older_hosts(qemu_img, monkeypatch):
    connection = vm_service.QEMUConfig.get_connection.return_value
    connection.getLibVersion.return_value = 8_000_000
    original = create_vm(9)
    connection.defineXML.reset_mock()
    monkeypatch.setattr(vm_service.Vm, "get", staticmethod(lambda vm_id: vm_id))

    vm_service.VmService.duplicate_vm(str(original.id))

    assert "qemu-vdagent" not in connection.defineXML.call_args.args[0]


def test_creation_omits_clipboard_when_qemu_lacks_agent_support(qemu_img):
    connection = vm_service.QEMUConfig.get_connection.return_value
    connection.domainXMLToNative.side_effect = libvirt.libvirtError(
        "chardev 'qemu-vdagent' not supported in this QEMU binary")

    create_vm(9)

    assert "qemu-vdagent" not in connection.defineXML.call_args.args[0]


def test_duplication_omits_clipboard_when_qemu_lacks_agent_support(
        qemu_img, monkeypatch):
    connection = vm_service.QEMUConfig.get_connection.return_value
    original = create_vm(9)
    connection.defineXML.reset_mock()
    connection.domainXMLToNative.side_effect = libvirt.libvirtError(
        "chardev 'qemu-vdagent' not supported in this QEMU binary")
    monkeypatch.setattr(vm_service.Vm, "get", staticmethod(lambda vm_id: vm_id))

    vm_service.VmService.duplicate_vm(str(original.id))

    assert "qemu-vdagent" not in connection.defineXML.call_args.args[0]
