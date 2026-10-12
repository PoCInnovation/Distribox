import asyncio

import pytest

from app.core.xml_builder import upgrade_display_devices
from app.routes import tunnel
from app.routes.tunnel import _resize_owner
from app.services.guacamole import (
    build_instruction,
    complete_instructions_end,
    guacd_handshake,
)


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


class _Writer:
    def __init__(self):
        self.data = b""

    def write(self, data: bytes) -> None:
        self.data += data

    async def drain(self) -> None:
        pass


@pytest.mark.asyncio
@pytest.mark.parametrize("resize, expected", [(True, "false"), (False, "true")])
async def test_guacd_handshake_sets_display_resize(resize, expected):
    reader = asyncio.StreamReader()
    reader.feed_data((
        build_instruction("args", "VERSION_1_5_0", "hostname",
                          "disable-display-resize")
        + build_instruction("ready", "$id")
    ).encode())
    writer = _Writer()

    await guacd_handshake(reader, writer, "127.0.0.1", 5900, resize=resize)

    connect = build_instruction("connect", "1.5.0", "127.0.0.1", expected)
    assert writer.data.decode().endswith(connect)


@pytest.fixture(autouse=True)
def _fresh_resize_owners(monkeypatch):
    monkeypatch.setattr(tunnel, "_resize_owners", {})


def test_resize_owner_follows_the_first_viewer():
    with _resize_owner("vm", "a") as first:
        with _resize_owner("vm", "b") as other:
            with _resize_owner("vm", "a") as reconnect:
                assert (first, other, reconnect) == (True, False, True)
        with _resize_owner("vm", "b") as other:
            assert not other


def test_resize_owner_survives_a_drop_for_the_grace_period(monkeypatch):
    with _resize_owner("vm", "a"):
        pass
    with _resize_owner("vm", "b") as other:
        assert not other
    with _resize_owner("vm", "a") as owner:
        assert owner
    monkeypatch.setattr(tunnel, "RESIZE_OWNER_GRACE_S", 0)
    with _resize_owner("vm", "b") as next_viewer:
        assert next_viewer
