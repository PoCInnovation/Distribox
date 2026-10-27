from uuid import uuid4

from lxml import etree

from app.core import xml_builder
from app.core.xml_builder import configure_vnc_audio
from app.models.vm import VmCreateXML


def assert_audio_link(xml, audio_id="1"):
    devices = etree.fromstring(xml.encode()).find("devices")
    assert devices.find('graphics[@type="vnc"]/audio').get("id") == audio_id
    assert devices.find("sound/audio").get("id") == audio_id
    return devices


def test_created_vm_has_headless_output_connected_to_vnc(tmp_path, monkeypatch):
    monkeypatch.setattr(xml_builder, "image_firmware", lambda name: "bios")
    monkeypatch.setattr(xml_builder, "VMS_DIR", tmp_path)
    vm = VmCreateXML(
        id=uuid4(), name="Audio VM", os="course.qcow2", mem=4,
        vcpus=2, disk_size=20,
    )

    xml = xml_builder.build_xml(vm)

    devices = assert_audio_link(xml)
    assert devices.find("audio").attrib == {"id": "1", "type": "none"}
    assert devices.find("sound").get("model") == "ich6"
    assert devices.find("sound/codec").get("type") == "output"
    assert configure_vnc_audio(xml) is None


def test_upgrade_adds_audio_without_changing_guest_disk_or_display():
    xml = """<domain><devices>
    <disk type='file'><source file='/vm/disk.qcow2'/></disk>
    <graphics type='vnc' listen='127.0.0.1' port='5905' keymap='fr'/>
    <channel type='unix'><target name='org.qemu.guest_agent.0'/></channel>
    </devices></domain>"""

    upgraded = configure_vnc_audio(xml)

    devices = assert_audio_link(upgraded)
    assert devices.find("disk/source").get("file") == "/vm/disk.qcow2"
    assert devices.find("graphics").attrib == {
        "type": "vnc", "listen": "127.0.0.1", "port": "5905", "keymap": "fr"}
    assert devices.find("channel/target").get("name") == "org.qemu.guest_agent.0"
    assert configure_vnc_audio(upgraded) is None


def test_existing_sound_card_and_backend_are_preserved():
    xml = """<domain><devices><graphics type='vnc'/>
    <sound model='ich9'><codec type='duplex'/><audio id='7'/>
    <address type='pci' slot='0x05'/></sound>
    <audio id='2' type='none'/>
    <audio id='7' type='pulseaudio' serverName='/custom/pulse'/>
    </devices></domain>"""

    devices = assert_audio_link(configure_vnc_audio(xml), "7")

    assert len(devices.findall("sound")) == 1
    assert devices.find("sound").get("model") == "ich9"
    assert devices.find("sound/codec").get("type") == "duplex"
    assert devices.find("sound/address").get("slot") == "0x05"
    assert [audio.attrib for audio in devices.findall("audio")] == [
        {"id": "2", "type": "none"},
        {"id": "7", "type": "pulseaudio", "serverName": "/custom/pulse"},
    ]


def test_unbound_existing_card_uses_its_only_backend():
    xml = """<domain><devices><graphics type='vnc'/>
    <sound model='ac97'/><audio id='3' type='none'/></devices></domain>"""
    devices = assert_audio_link(configure_vnc_audio(xml), "3")
    assert devices.find("sound").get("model") == "ac97"


def test_custom_or_non_vnc_configurations_are_not_rewritten():
    layouts = [
        "<domain/>",
        "<domain><devices><graphics type='spice'/></devices></domain>",
        """<domain><devices><graphics type='vnc'><audio id='9'/></graphics>
        <audio id='9' type='none'/><sound model='usb'/></devices></domain>""",
        """<domain><devices><graphics type='vnc'/><sound model='ich9'/>
        <audio id='1' type='none'/><audio id='2' type='none'/></devices></domain>""",
        """<domain><devices><graphics type='vnc'/>
        <sound model='ich9'><audio id='7'/></sound></devices></domain>""",
    ]
    for xml in layouts:
        assert configure_vnc_audio(xml) is None
