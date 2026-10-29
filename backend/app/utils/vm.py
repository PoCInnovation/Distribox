from time import sleep, time
import subprocess
import json
from typing import Optional
from xml.etree import ElementTree
import libvirt


def get_pause_reason(vm, state: int, reason: int) -> Optional[str]:
    if state != libvirt.VIR_DOMAIN_PAUSED:
        return None
    if reason == libvirt.VIR_DOMAIN_PAUSED_IOERROR:
        try:
            if libvirt.VIR_DOMAIN_DISK_ERROR_NO_SPACE in vm.diskErrors().values():
                return "Host disk full"
        except libvirt.libvirtError:
            pass
        return "Disk I/O error"
    if reason == libvirt.VIR_DOMAIN_PAUSED_USER:
        return "Paused by a user"
    return "Pause reason unavailable"


def recover_after_pause(vm) -> Optional[str]:
    failed = []
    try:
        vm.setTime({"seconds": int(time()), "nseconds": 0})
    except libvirt.libvirtError:
        failed.append("clock")
    try:
        # A link change makes the guest renew DHCP without OS-specific commands.
        root = ElementTree.fromstring(vm.XMLDesc(0))
        for interface in root.findall("./devices/interface[@type='network']"):
            link = interface.find("link")
            if link is None:
                link = ElementTree.SubElement(interface, "link")
            if link.get("state") == "down":
                continue
            try:
                link.set("state", "down")
                vm.updateDeviceFlags(ElementTree.tostring(interface, encoding="unicode"),
                                     libvirt.VIR_DOMAIN_AFFECT_LIVE)
                sleep(1)
            finally:
                link.set("state", "up")
                vm.updateDeviceFlags(ElementTree.tostring(interface, encoding="unicode"),
                                     libvirt.VIR_DOMAIN_AFFECT_LIVE)
    except (libvirt.libvirtError, ElementTree.ParseError):
        failed.append("network")
    if failed:
        return (f"VM resumed, but its {' and '.join(failed)} could not be refreshed. "
                "Open the console to check it, or restart the VM before using SSH.")
    return None


def wait_for_state(vm, state_code: int, timeout: float, retries: int):
    for _ in range(0, retries):
        code, _ = vm.state()
        if state_code == code:
            return code
        sleep(timeout)
    return code


def get_vm_ip(vm_name: str, interface: str = "ens3") -> Optional[str]:
    try:
        cmd = [
            "virsh",
            "qemu-agent-command",
            vm_name,
            '{"execute":"guest-network-get-interfaces"}'
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )

        data = json.loads(result.stdout)

        for iface in data.get("return", []):
            if iface.get("name") == interface:
                for addr in iface.get("ip-addresses", []):
                    if addr.get("ip-address-type") == "ipv4":
                        return addr.get("ip-address")
        return None

    except Exception:
        return None
