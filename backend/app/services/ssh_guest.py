import base64
import binascii
import ipaddress
import json
import os
import stat
import tempfile
import time
from pathlib import Path
from threading import Lock
from uuid import UUID
from xml.etree import ElementTree

import libvirt
import libvirt_qemu
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import HTTPException

from app.core.constants import VMS_DIR
from app.utils.crypto import decrypt_secret, encrypt_secret


GUEST_SETUP = r'''
set -eu
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
command -v sshd >/dev/null
id user >/dev/null
guest_home=$(awk -F: '$1 == "user" { print $6 }' /etc/passwd)
case "$guest_home" in /*) ;; *) exit 1 ;; esac
umask 077
mkdir -p "$guest_home/.ssh"
touch "$guest_home/.ssh/authorized_keys"
grep -Fqx "$1" "$guest_home/.ssh/authorized_keys" || printf '\n%s\n' "$1" >> "$guest_home/.ssh/authorized_keys"
chmod 700 "$guest_home/.ssh"
chmod 600 "$guest_home/.ssh/authorized_keys"
chown "$(id -u user):$(id -g user)" "$guest_home/.ssh" "$guest_home/.ssh/authorized_keys"
if command -v restorecon >/dev/null; then restorecon -RF "$guest_home/.ssh"; fi
mkdir -p /etc/ssh/sshd_config.d /run/sshd
chmod 755 /run/sshd
printf '%s\n' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PermitRootLogin no' 'PubkeyAuthentication yes' > /etc/ssh/sshd_config.d/00-distribox.conf
chmod 644 /etc/ssh/sshd_config.d/00-distribox.conf
include='Include /etc/ssh/sshd_config.d/00-distribox.conf'
if [ "$(head -n 1 /etc/ssh/sshd_config)" != "$include" ]; then
    config=$(mktemp /etc/ssh/sshd_config.XXXXXX)
    trap 'rm -f "$config"' EXIT
    printf '%s\n' "$include" > "$config"
    awk -v include="$include" '$0 != include' /etc/ssh/sshd_config >> "$config"
    chmod 600 "$config"
    mv "$config" /etc/ssh/sshd_config
    trap - EXIT
fi
ssh-keygen -A >/dev/null
sshd -t
if command -v systemctl >/dev/null; then
    systemctl reload-or-restart ssh.service >/dev/null 2>&1 || systemctl reload-or-restart sshd.service >/dev/null 2>&1
elif command -v rc-service >/dev/null; then
    rc-service sshd reload >/dev/null 2>&1 || rc-service sshd start >/dev/null 2>&1
else
    exit 1
fi
cat /etc/ssh/ssh_host_*_key.pub
'''


PREPARED_TTL = 600
_prepared: dict[str, tuple[object, float, dict]] = {}
_locks: dict[str, Lock] = {}
_locks_lock = Lock()


def _vm_lock(vm_id: str) -> Lock:
    with _locks_lock:
        return _locks.setdefault(vm_id, Lock())


def _get_connection():
    from app.core.config import QEMUConfig
    return QEMUConfig.get_connection()


def _running_domain(vm_id: str):
    try:
        normalized = str(UUID(vm_id))
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(400, "Invalid VM ID") from exc
    try:
        connection = _get_connection()
        domain = connection.lookupByName(normalized)
        if not domain.isActive():
            raise HTTPException(409, "Start the VM before connecting with SSH")
        return connection, domain
    except libvirt.libvirtError as exc:
        raise HTTPException(503, "The VM is unavailable for SSH") from exc


def _target_address(connection, domain) -> str:
    domain_xml = ElementTree.fromstring(domain.XMLDesc(0))
    for interface in domain_xml.findall("./devices/interface[@type='network']"):
        source, mac = interface.find("source"), interface.find("mac")
        if source is None or mac is None or not mac.get("address"):
            continue
        network_name = source.get("network")
        if not network_name:
            continue
        network = connection.networkLookupByName(network_name)
        if not network.isActive():
            continue
        network_xml = ElementTree.fromstring(network.XMLDesc(0))
        forward = network_xml.find("forward")
        if forward is not None and forward.get("mode") not in {"nat", "route"}:
            continue
        addresses = []
        for element in network_xml.findall("ip"):
            if element.get("family", "ipv4") != "ipv4":
                continue
            prefix = element.get("prefix") or element.get("netmask")
            if not prefix or element.find("dhcp") is None:
                continue
            addresses.append(ipaddress.IPv4Interface(
                f"{element.get('address')}/{prefix}"))
        mac_address = mac.get("address").lower()
        for lease in network.DHCPLeases(mac_address):
            if lease.get("mac", "").lower() != mac_address:
                continue
            expiry = lease.get("expirytime", 0)
            if expiry and expiry <= time.time():
                continue
            try:
                address = ipaddress.IPv4Address(lease.get("ipaddr", ""))
            except ipaddress.AddressValueError:
                continue
            if address.is_loopback or address.is_link_local or address.is_multicast or address.is_unspecified:
                continue
            if any(address == item.ip for item in addresses):
                continue
            if any(address in item.network and address not in {
                item.network.network_address, item.network.broadcast_address
            } for item in addresses):
                return str(address)
    raise HTTPException(
        409, "SSH is waiting for a trusted IPv4 DHCP lease on this VM")


def resolve_guest_target(vm_id: str) -> str:
    connection, domain = _running_domain(vm_id)
    try:
        return _target_address(connection, domain)
    except (libvirt.libvirtError, ElementTree.ParseError, ValueError) as exc:
        raise HTTPException(
            503, "Cannot resolve the VM's SSH address") from exc


def _load_private_key(vm_id: str) -> Ed25519PrivateKey:
    if len(os.environ.get("DISTRIBOX_SECRET", "")) < 32:
        raise HTTPException(
            503, "SSH requires DISTRIBOX_SECRET with at least 32 characters on this host")
    vm_dir = VMS_DIR / str(UUID(vm_id))
    if not vm_dir.is_dir() or vm_dir.is_symlink():
        raise HTTPException(409, "The VM storage is unavailable for SSH")
    key_path = vm_dir / "ssh-client-key.enc"
    if not key_path.exists():
        key = Ed25519PrivateKey.generate()
        plaintext = key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.OpenSSH,
            serialization.NoEncryption(),
        ).decode()
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", dir=vm_dir, delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(encrypt_secret(plaintext))
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temporary, key_path)
            except FileExistsError:
                pass
        finally:
            if temporary:
                temporary.unlink(missing_ok=True)
    descriptor = os.open(key_path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "r") as stream:
        metadata = os.fstat(stream.fileno())
        if not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise HTTPException(
                503, "The VM SSH key must be a regular file with permissions 0600")
        key = serialization.load_ssh_private_key(
            decrypt_secret(stream.read(16384)).encode(), password=None,
        )
    if not isinstance(key, Ed25519PrivateKey):
        raise HTTPException(503, "The VM SSH key is invalid")
    return key


def _agent_command(domain, command: str, arguments: dict) -> dict:
    try:
        response = json.loads(libvirt_qemu.qemuAgentCommand(
            domain, json.dumps(
                {"execute": command, "arguments": arguments}), 10, 0,
        ))
        if not isinstance(response, dict) or "error" in response or not isinstance(response.get("return"), dict):
            raise ValueError("Invalid guest agent response")
        return response["return"]
    except (libvirt.libvirtError, ValueError) as exc:
        raise HTTPException(
            503, "SSH requires a running QEMU guest agent with guest-exec enabled") from exc


def _install_key(domain, public_key: str) -> list[str]:
    process = _agent_command(domain, "guest-exec", {
        "path": "/bin/sh", "arg": ["-c", GUEST_SETUP, "distribox-ssh", public_key],
        "capture-output": True,
    })
    pid = process.get("pid")
    if not isinstance(pid, int) or pid <= 0:
        raise HTTPException(503, "The guest agent could not prepare SSH")
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        result = _agent_command(domain, "guest-exec-status", {"pid": pid})
        if not result.get("exited"):
            time.sleep(0.2)
            continue
        if result.get("exitcode") != 0 or result.get("out-truncated"):
            raise HTTPException(
                409, "SSH setup failed; the VM needs OpenSSH server and the user account")
        try:
            output = base64.b64decode(result.get(
                "out-data", ""), validate=True).decode()
            if len(output) > 65536:
                raise ValueError("Guest output is too large")
            keys = [serialization.load_ssh_public_key(line.encode()).public_bytes(
                serialization.Encoding.OpenSSH, serialization.PublicFormat.OpenSSH,
            ).decode() for line in output.splitlines() if line.strip()]
            if not keys:
                raise ValueError("Missing host keys")
            return keys
        except (ValueError, UnicodeError, binascii.Error, UnsupportedAlgorithm) as exc:
            raise HTTPException(
                503, "The VM did not provide valid SSH host keys") from exc
    raise HTTPException(
        504, "The VM took too long to prepare SSH; try again shortly")


def prepare_guest(vm_id: str) -> dict:
    connection, domain = _running_domain(vm_id)
    with _vm_lock(vm_id):
        cached = _prepared.get(vm_id)
        if cached and cached[0] == domain.ID() and cached[1] > time.monotonic():
            return cached[2]
        details = _prepare_running_guest(connection, domain, vm_id)
        _prepared[vm_id] = (
            domain.ID(), time.monotonic() + PREPARED_TTL, details)
        return details


def _prepare_running_guest(connection, domain, vm_id: str) -> dict:
    try:
        host = _target_address(connection, domain)
    except (libvirt.libvirtError, ElementTree.ParseError, ValueError) as exc:
        raise HTTPException(
            503, "Cannot resolve the VM's SSH address") from exc
    try:
        key = _load_private_key(vm_id)
    except (OSError, ValueError, UnsupportedAlgorithm) as exc:
        raise HTTPException(
            503, "Cannot read the VM SSH key; check storage and DISTRIBOX_SECRET") from exc
    public_key = key.public_key().public_bytes(
        serialization.Encoding.OpenSSH, serialization.PublicFormat.OpenSSH,
    ).decode()
    host_keys = _install_key(domain, public_key)
    return {
        "host": host,
        "port": 22,
        "username": "user",
        "private_key": key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.OpenSSH,
            serialization.NoEncryption(),
        ).decode(),
        "host_keys": host_keys,
    }
