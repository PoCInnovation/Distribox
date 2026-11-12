from uuid import uuid4

import pytest
from lxml import etree

from app.core import config, xml_builder
from app.core.xml_builder import configure_display_resolution
from app.models.vm import VmCreateXML
from app.services import vm_service
from test_vm_keyboard import DOMAIN_XML, vm_start  # noqa: F401


def display_resolution(xml):
    model = etree.fromstring(xml.encode()).find("./devices/video/model")
    resolution = model.find("resolution")
    return None if resolution is None else dict(resolution.attrib)


@pytest.mark.parametrize("value,expected", [
    ("1920x1080", (1920, 1080)), (" 640x480 ", (640, 480)),
    ("3840x2160", (3840, 2160)), ("", None), ("  ", None),
])
def test_fixed_size_is_optional(monkeypatch, value, expected):
    monkeypatch.setenv("VITE_GLISS_RESOLUTION", value)

    assert config.desktop_resolution() == expected


@pytest.mark.parametrize("value", [
    "1920", "1920x", "1920X1080", "1920x1080x60", "1920 x 1080", "-1920x1080",
    "1930x1080", "1920x1081", "624x480", "640x478", "3856x2160", "3840x2162",
])
def test_malformed_fixed_size_is_rejected(monkeypatch, value):
    monkeypatch.setenv("VITE_GLISS_RESOLUTION", value)

    with pytest.raises(ValueError, match="VITE_GLISS_RESOLUTION"):
        config.desktop_resolution()


@pytest.mark.parametrize("value,expected", [
    ("1920x1080", {"x": "1920", "y": "1080"}), ("", None),
])
def test_created_vm_starts_in_the_fixed_size(
        tmp_path, monkeypatch, value, expected):
    monkeypatch.setenv("VITE_GLISS_RESOLUTION", value)
    monkeypatch.setattr(xml_builder, "image_firmware", lambda name: "bios")
    monkeypatch.setattr(xml_builder, "VMS_DIR", tmp_path)
    vm = VmCreateXML(
        id=uuid4(), name="Course VM", os="course.qcow2", mem=4,
        vcpus=2, disk_size=20,
    )

    assert display_resolution(xml_builder.build_xml(vm)) == expected


def test_existing_vm_takes_the_fixed_size_at_its_next_start(
        vm_start, monkeypatch):
    vm_id, engine, domain, connection, state = vm_start
    monkeypatch.setenv("VITE_GLISS_RESOLUTION", "1920x1080")

    vm_service.VmService.start_vm(vm_id)

    assert display_resolution(state["starts"][0][0]) == {
        "x": "1920", "y": "1080"}
    assert configure_display_resolution(state["xml"]) is None
    monkeypatch.setenv("VITE_GLISS_RESOLUTION", "1280x720")
    assert display_resolution(configure_display_resolution(state["xml"])) == {
        "x": "1280", "y": "720"}


def test_saved_guest_keeps_its_display(vm_start, monkeypatch):
    vm_id, engine, domain, connection, state = vm_start
    monkeypatch.setenv("VITE_GLISS_RESOLUTION", "1920x1080")
    domain.hasManagedSaveImage.return_value = True

    vm_service.VmService.start_vm(vm_id)

    persistent, saved = state["starts"][0]
    assert display_resolution(persistent) is None
    assert display_resolution(saved) is None


def test_only_a_virtio_display_takes_the_fixed_size(monkeypatch):
    monkeypatch.setenv("VITE_GLISS_RESOLUTION", "1920x1080")

    assert configure_display_resolution(
        DOMAIN_XML.replace("<model type='virtio'/>", "<model type='vga'/>")) is None
    assert configure_display_resolution(
        DOMAIN_XML.replace("<video><model type='virtio'/></video>", "")) is None
