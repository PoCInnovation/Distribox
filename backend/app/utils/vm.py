from time import sleep
import subprocess
import json
from typing import Optional


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
