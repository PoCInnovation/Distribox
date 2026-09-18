import base64
import json
import os
import stat
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import libvirt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import HTTPException

from app.services import ssh_guest
from app.utils.crypto import _get_fernet, decrypt_secret


MAC = "52:54:00:12:34:56"
DOMAIN_XML = f"""<domain><devices><interface type="network">
    <source network="default"/><mac address="{MAC}"/>
    </interface></devices></domain>"""
NETWORK_XML = """<network><forward mode="nat"/>
    <ip address="192.168.122.1" netmask="255.255.255.0">
    <dhcp><range start="192.168.122.2" end="192.168.122.254"/></dhcp>
    </ip></network>"""


@pytest.fixture
def guest(monkeypatch, tmp_path):
    vm_id = str(uuid4())
    vm_dir = tmp_path / vm_id
    vm_dir.mkdir()
    domain = Mock()
    domain.isActive.return_value = True
    domain.XMLDesc.return_value = DOMAIN_XML
    network = Mock()
    network.isActive.return_value = True
    network.XMLDesc.return_value = NETWORK_XML
    network.DHCPLeases.return_value = [{
        "mac": MAC, "ipaddr": "192.168.122.42", "expirytime": 0,
    }]
    connection = Mock()
    connection.lookupByName.return_value = domain
    connection.networkLookupByName.return_value = network
    monkeypatch.setattr(ssh_guest, "_get_connection", lambda: connection)
    monkeypatch.setattr(ssh_guest, "VMS_DIR", tmp_path)
    monkeypatch.setenv("DISTRIBOX_SECRET",
                       "test-encryption-secret-for-ssh-guest")
    _get_fernet.cache_clear()
    yield SimpleNamespace(id=vm_id, directory=vm_dir, domain=domain,
                          network=network, connection=connection)
    _get_fernet.cache_clear()


def public_key():
    return Ed25519PrivateKey.generate().public_key().public_bytes(
        serialization.Encoding.OpenSSH, serialization.PublicFormat.OpenSSH,
    ).decode()


def agent_response(monkeypatch, stdout, exitcode=0):
    def respond(domain, command, timeout, flags):
        request = json.loads(command)
        if request["execute"] == "guest-exec":
            return json.dumps({"return": {"pid": 123}})
        return json.dumps({"return": {
            "exited": True, "exitcode": exitcode,
            "out-data": base64.b64encode(stdout.encode()).decode(),
        }})
    command = Mock(side_effect=respond)
    monkeypatch.setattr(ssh_guest.libvirt_qemu, "qemuAgentCommand", command)
    return command


def test_prepare_uses_pinned_host_key_and_persistent_encrypted_identity(guest, monkeypatch):
    host_key = public_key()
    agent = agent_response(monkeypatch, host_key + " guest-comment\n")

    first = ssh_guest.prepare_guest(guest.id)
    second = ssh_guest.prepare_guest(guest.id)

    first_key = serialization.load_ssh_private_key(
        first["private_key"].encode(), password=None)
    second_key = serialization.load_ssh_private_key(
        second["private_key"].encode(), password=None)
    assert first_key.private_bytes_raw() == second_key.private_bytes_raw()
    assert first["host"] == "192.168.122.42"
    assert first["port"] == 22
    assert first["username"] == "user"
    assert first["host_keys"] == [host_key]
    stored = guest.directory / "ssh-client-key.enc"
    assert stat.S_IMODE(stored.stat().st_mode) == 0o600
    assert stored.read_text().startswith("enc::")
    assert "PRIVATE KEY" not in stored.read_text()
    stored_key = serialization.load_ssh_private_key(
        decrypt_secret(stored.read_text()).encode(), password=None)
    assert stored_key.private_bytes_raw() == first_key.private_bytes_raw()
    assert "PRIVATE KEY" not in str(agent.call_args_list)
    assert not list(guest.directory.glob("tmp*"))


@pytest.mark.parametrize("lease", [
    {"mac": "52:54:00:00:00:00", "ipaddr": "192.168.122.42", "expirytime": 0},
    {"mac": MAC, "ipaddr": "192.168.122.42", "expirytime": 1},
    {"mac": MAC, "ipaddr": "127.0.0.1", "expirytime": 0},
    {"mac": MAC, "ipaddr": "169.254.169.254", "expirytime": 0},
    {"mac": MAC, "ipaddr": "192.168.122.1", "expirytime": 0},
    {"mac": MAC, "ipaddr": "192.168.122.0", "expirytime": 0},
    {"mac": MAC, "ipaddr": "192.168.122.255", "expirytime": 0},
    {"mac": MAC, "ipaddr": "10.0.0.2", "expirytime": 0},
    {"mac": MAC, "ipaddr": "::1", "expirytime": 0},
    {"mac": MAC, "ipaddr": "example.com", "expirytime": 0},
])
def test_untrusted_or_expired_network_targets_are_rejected(guest, lease):
    guest.network.DHCPLeases.return_value = [lease]
    with pytest.raises(HTTPException) as failure:
        ssh_guest.resolve_guest_target(guest.id)
    assert failure.value.status_code == 409
    assert not list(guest.directory.iterdir())


def test_resolving_target_does_not_execute_guest_commands(guest, monkeypatch):
    agent = Mock()
    monkeypatch.setattr(ssh_guest.libvirt_qemu, "qemuAgentCommand", agent)
    assert ssh_guest.resolve_guest_target(guest.id) == "192.168.122.42"
    agent.assert_not_called()


def test_unmanaged_bridge_is_rejected(guest):
    guest.network.XMLDesc.return_value = NETWORK_XML.replace(
        'mode="nat"', 'mode="bridge"')
    with pytest.raises(HTTPException):
        ssh_guest.resolve_guest_target(guest.id)
    guest.network.DHCPLeases.assert_not_called()


def test_stopped_vm_is_not_prepared(guest, monkeypatch):
    guest.domain.isActive.return_value = False
    agent = Mock()
    monkeypatch.setattr(ssh_guest.libvirt_qemu, "qemuAgentCommand", agent)
    with pytest.raises(HTTPException) as failure:
        ssh_guest.prepare_guest(guest.id)
    assert failure.value.status_code == 409
    agent.assert_not_called()
    assert not list(guest.directory.iterdir())


def test_invalid_uuid_never_reaches_libvirt(guest):
    with pytest.raises(HTTPException) as failure:
        ssh_guest.prepare_guest("../../other-vm")
    assert failure.value.status_code == 400
    guest.connection.lookupByName.assert_not_called()


def test_existing_key_with_unsafe_permissions_is_rejected(guest):
    ssh_guest._load_private_key(guest.id)
    key_file = guest.directory / "ssh-client-key.enc"
    os.chmod(key_file, 0o644)
    with pytest.raises(HTTPException) as failure:
        ssh_guest._load_private_key(guest.id)
    assert failure.value.status_code == 503


def test_concurrent_connections_share_one_persisted_identity(guest):
    with ThreadPoolExecutor(max_workers=8) as executor:
        keys = list(executor.map(
            lambda _: ssh_guest._load_private_key(guest.id), range(8)))
    assert len({key.private_bytes_raw() for key in keys}) == 1
    assert [path.name for path in guest.directory.iterdir()] == [
        "ssh-client-key.enc"]


def test_existing_key_symlink_is_rejected(guest, tmp_path):
    elsewhere = tmp_path / "elsewhere"
    elsewhere.write_text("do not read")
    (guest.directory / "ssh-client-key.enc").symlink_to(elsewhere)
    with pytest.raises(HTTPException) as failure:
        ssh_guest.prepare_guest(guest.id)
    assert failure.value.status_code == 503
    assert elsewhere.read_text() == "do not read"


@pytest.mark.parametrize("secret", ["", "secret", "a" * 31])
def test_weak_storage_secret_prevents_guest_setup(guest, monkeypatch, secret):
    monkeypatch.setenv("DISTRIBOX_SECRET", secret)
    agent = Mock()
    monkeypatch.setattr(ssh_guest.libvirt_qemu, "qemuAgentCommand", agent)
    with pytest.raises(HTTPException) as failure:
        ssh_guest.prepare_guest(guest.id)
    assert failure.value.status_code == 503
    agent.assert_not_called()
    assert not list(guest.directory.iterdir())


def test_unavailable_guest_agent_does_not_leak_its_error(guest, monkeypatch):
    agent = Mock(side_effect=libvirt.libvirtError("sensitive diagnostic"))
    monkeypatch.setattr(ssh_guest.libvirt_qemu, "qemuAgentCommand", agent)
    with pytest.raises(HTTPException) as failure:
        ssh_guest.prepare_guest(guest.id)
    assert failure.value.status_code == 503
    assert "sensitive diagnostic" not in failure.value.detail


@pytest.mark.parametrize("output,exitcode", [("untrusted host key", 0), ("", 0), ("error detail", 1)])
def test_failed_setup_or_invalid_host_identity_fails_closed(guest, monkeypatch, output, exitcode):
    agent_response(monkeypatch, output, exitcode)
    with pytest.raises(HTTPException) as failure:
        ssh_guest.prepare_guest(guest.id)
    assert failure.value.status_code in {409, 503}
    if output:
        assert output not in failure.value.detail


def test_slow_guest_setup_has_a_deadline(guest, monkeypatch):
    command = Mock(side_effect=[{"pid": 123}, {"exited": False}])
    monkeypatch.setattr(ssh_guest, "_agent_command", command)
    monkeypatch.setattr(ssh_guest.time, "monotonic",
                        Mock(side_effect=[0, 1, 31]))
    monkeypatch.setattr(ssh_guest.time, "sleep", lambda _: None)
    with pytest.raises(HTTPException) as failure:
        ssh_guest._install_key(guest.domain, public_key())
    assert failure.value.status_code == 504
