from app.core.xml_builder import upgrade_display_devices
from app.services.guacamole import build_instruction, complete_instructions_end


def test_complete_instructions_end_returns_zero_without_full_instruction():
    assert complete_instructions_end("") == 0
    assert complete_instructions_end("4.syn") == 0
    assert complete_instructions_end("4.sync,2.12") == 0


def test_complete_instructions_end_keeps_partial_tail():
    text = build_instruction("sync", "12") + build_instruction("img", "1")[:-3]
    assert complete_instructions_end(text) == len(build_instruction("sync", "12"))


def test_complete_instructions_end_ignores_semicolons_in_data():
    text = build_instruction("name", "a;b") + build_instruction("sync", "1")
    assert complete_instructions_end(text) == len(text)
    assert complete_instructions_end(text[:-1]) == len(build_instruction("name", "a;b"))


def test_complete_instructions_end_counts_characters_not_bytes():
    text = build_instruction("name", "café") + build_instruction("sync", "1")
    assert complete_instructions_end(text) == len(text)


VGA_DOMAIN = """<domain type='kvm'><name>x</name><devices>
<input type='keyboard' bus='ps2'/>
<input type='tablet' bus='usb'><address type='usb' bus='0' port='1'/></input>
<video><model type='vga' vram='16384' heads='1' primary='yes'/>
<address type='pci' domain='0x0000' bus='0x00' slot='0x02' function='0x0'/></video>
</devices></domain>"""


def test_upgrade_display_devices_switches_to_virtio():
    upgraded = upgrade_display_devices(VGA_DOMAIN)
    assert "<model type=\"virtio\"/>" in upgraded
    assert "vram" not in upgraded
    assert "<input type=\"tablet\" bus=\"virtio\"/>" in upgraded
    assert "type=\"usb\"" not in upgraded
    assert "slot=\"0x02\"" in upgraded


def test_upgrade_display_devices_is_idempotent():
    upgraded = upgrade_display_devices(VGA_DOMAIN)
    assert upgrade_display_devices(upgraded) is None


def test_upgrade_display_devices_skips_unknown_layout():
    assert upgrade_display_devices("<domain><devices/></domain>") is None
