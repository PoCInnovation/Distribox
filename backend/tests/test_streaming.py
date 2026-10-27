import pytest
from fastapi import HTTPException

from app.core.xml_builder import upgrade_display_devices
from app.routes import tunnel
from app.routes.tunnel import _resize_owner, gliss_module
from app.services.desktop_stream import is_resize
from app.services.gliss import web_dir


def test_is_resize_matches_only_resize_messages():
    assert is_resize('{"type":"resize","width":1280,"height":800,"id":3}')
    assert not is_resize('{"type":"key","keysym":97,"down":true,"id":4}')
    assert not is_resize("not json")
    assert not is_resize('["resize"]')


def test_web_dir_exports_the_installed_gliss_client():
    assert "export class GlissClient" in (web_dir() / "client.js").read_text()


@pytest.mark.asyncio
async def test_gliss_module_serves_only_exported_files(tmp_path, monkeypatch):
    (tmp_path / "client.js").write_text("export {}")
    monkeypatch.setattr(tunnel, "web_dir", lambda: tmp_path)
    response = await gliss_module("client.js")
    assert response.media_type == "text/javascript"
    for path in ("../client.js", "missing.js", ""):
        with pytest.raises(HTTPException):
            await gliss_module(path)


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
