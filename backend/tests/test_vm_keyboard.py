from unittest.mock import Mock
from uuid import UUID

import libvirt
import pytest
from lxml import etree
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.orm.vm import VmORM
from app.services import vm_service


DOMAIN_XML = """<domain type='kvm'><name>course-vm</name><devices>
<disk type='file' device='disk'><source file='/course/glo-2000.qcow2'/></disk>
<graphics type='vnc' port='-1' autoport='yes' listen='127.0.0.1'/>
<input type='keyboard' bus='ps2'/><input type='tablet' bus='virtio'/>
<video><model type='virtio'/></video>
</devices></domain>"""


def vnc_keymap(xml):
    return etree.fromstring(xml.encode()).find(
        './devices/graphics[@type="vnc"]').get("keymap")


@pytest.fixture
def vm_start(tmp_path, monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(vm_service, "engine", engine)
    monkeypatch.setattr(vm_service, "VMS_DIR", tmp_path)
    monkeypatch.setattr(vm_service, "ensure_default_network", Mock())
    monkeypatch.setattr(vm_service, "ensure_seed_iso", Mock())
    monkeypatch.setattr(vm_service, "get_vm_ip", lambda vm_id: None)
    record = VmORM(
        name="GLO-2000 Lab", os="glo-2000-vm.qcow2", mem=4,
        vcpus=2, disk_size=20, keyboard_layout="fr-fr-azerty",
    )
    with Session(engine) as session:
        session.add(record)
        session.commit()
        vm_id = str(record.id)

    state = {"xml": DOMAIN_XML, "saved_xml": DOMAIN_XML, "starts": []}
    domain = Mock()
    domain.isActive.return_value = 0
    domain.state.return_value = (libvirt.VIR_DOMAIN_SHUTOFF, 0)
    domain.XMLDesc.side_effect = lambda flags=0: state["xml"]
    domain.hasManagedSaveImage.return_value = False
    domain.managedSaveGetXMLDesc.side_effect = lambda flags=0: state["saved_xml"]
    domain.managedSaveDefineXML.side_effect = lambda xml, flags=0: state.update(
        saved_xml=xml)

    def start():
        state["starts"].append((state["xml"], state["saved_xml"]))
        domain.isActive.return_value = 1
        domain.state.return_value = (libvirt.VIR_DOMAIN_RUNNING, 0)

    domain.create.side_effect = start
    connection = Mock()
    connection.lookupByName.return_value = domain
    connection.defineXML.side_effect = lambda xml: state.update(xml=xml)
    monkeypatch.setattr(vm_service.QEMUConfig, "get_connection",
                        lambda: connection)
    yield vm_id, engine, domain, connection, state
    engine.dispose()


@pytest.mark.parametrize("old_keymap", [None, "en-us"])
@pytest.mark.parametrize("layout,keymap", [
    ("fr-fr-azerty", "fr"), ("de-de-qwertz", "de"),
    ("en-us-qwerty", "en-us"),
])
def test_start_uses_saved_keyboard_layout(vm_start, old_keymap, layout, keymap):
    vm_id, engine, domain, connection, state = vm_start
    root = etree.fromstring(state["xml"].encode())
    if old_keymap:
        root.find('./devices/graphics').set("keymap", old_keymap)
    state["xml"] = etree.tostring(root, encoding="unicode")
    with Session(engine) as session:
        record = session.get(VmORM, UUID(vm_id))
        record.keyboard_layout = layout
        session.add(record)
        session.commit()

    result = vm_service.VmService.start_vm(vm_id)

    assert result.state == "Running"
    assert vnc_keymap(state["starts"][0][0]) == keymap
    root = etree.fromstring(state["xml"].encode())
    assert root.find('./devices/disk/source').get("file") == "/course/glo-2000.qcow2"
    assert root.find('./devices/graphics').get("listen") == "127.0.0.1"


@pytest.mark.parametrize("layout", [None, "", "unrecognized"])
def test_unconfigured_layout_preserves_existing_keymap(vm_start, layout):
    vm_id, engine, domain, connection, state = vm_start
    state["xml"] = DOMAIN_XML.replace("type='vnc'", "type='vnc' keymap='fr'")
    with Session(engine) as session:
        record = session.get(VmORM, UUID(vm_id))
        record.keyboard_layout = layout
        session.add(record)
        session.commit()

    vm_service.VmService.start_vm(vm_id)

    assert vnc_keymap(state["starts"][0][0]) == "fr"
    connection.defineXML.assert_not_called()


def test_restore_applies_layout_without_changing_saved_guest_devices(vm_start):
    vm_id, engine, domain, connection, state = vm_start
    state["xml"] = DOMAIN_XML.replace("bus='virtio'", "bus='usb'").replace(
        "type='virtio'", "type='vga'")
    state["saved_xml"] = state["xml"]
    domain.hasManagedSaveImage.return_value = True

    vm_service.VmService.start_vm(vm_id)

    persistent, saved = state["starts"][0]
    assert vnc_keymap(persistent) == "fr"
    assert vnc_keymap(saved) == "fr"
    for xml in (persistent, saved):
        root = etree.fromstring(xml.encode())
        assert root.find('./devices/video/model').get("type") == "vga"
        assert root.find('./devices/input[@type="tablet"]').get("bus") == "usb"
    domain.managedSaveRemove.assert_not_called()


def test_future_starts_keep_the_configured_layout(vm_start):
    vm_id, engine, domain, connection, state = vm_start
    vm_service.VmService.start_vm(vm_id)
    connection.defineXML.reset_mock()
    domain.isActive.return_value = 0
    domain.state.return_value = (libvirt.VIR_DOMAIN_SHUTOFF, 0)

    vm_service.VmService.start_vm(vm_id)

    assert vnc_keymap(state["starts"][1][0]) == "fr"
    connection.defineXML.assert_not_called()


def test_saved_keymap_is_corrected_when_persistent_keymap_already_matches(vm_start):
    vm_id, engine, domain, connection, state = vm_start
    state["xml"] = DOMAIN_XML.replace("type='vnc'", "type='vnc' keymap='fr'")
    domain.hasManagedSaveImage.return_value = True

    vm_service.VmService.start_vm(vm_id)

    assert vnc_keymap(state["starts"][0][1]) == "fr"
    connection.defineXML.assert_not_called()


def test_keyboard_and_display_upgrades_are_applied_together_on_cold_start(vm_start):
    vm_id, engine, domain, connection, state = vm_start
    state["xml"] = DOMAIN_XML.replace("bus='virtio'", "bus='usb'").replace(
        "type='virtio'", "type='vga'")

    vm_service.VmService.start_vm(vm_id)

    xml = state["starts"][0][0]
    assert vnc_keymap(xml) == "fr"
    root = etree.fromstring(xml.encode())
    assert root.find('./devices/video/model').get("type") == "virtio"
    assert root.find('./devices/input[@type="tablet"]').get("bus") == "virtio"
    connection.defineXML.assert_called_once()


def test_keyboard_configuration_does_not_require_standard_display_devices(vm_start):
    vm_id, engine, domain, connection, state = vm_start
    state["xml"] = """<domain><devices>
    <graphics type='vnc' port='-1' autoport='yes'/>
    </devices></domain>"""

    vm_service.VmService.start_vm(vm_id)

    assert vnc_keymap(state["starts"][0][0]) == "fr"


def test_starting_an_active_vm_does_not_change_its_configuration(vm_start):
    vm_id, engine, domain, connection, state = vm_start
    domain.isActive.return_value = 1
    domain.state.return_value = (libvirt.VIR_DOMAIN_RUNNING, 0)

    vm_service.VmService.start_vm(vm_id)

    connection.defineXML.assert_not_called()
    domain.managedSaveDefineXML.assert_not_called()
    domain.create.assert_not_called()
