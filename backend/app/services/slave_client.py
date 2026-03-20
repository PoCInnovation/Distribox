"""HTTP client for Master -> Slave communication."""
import logging
from typing import Optional
import httpx
from app.orm.slave import SlaveORM

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(30.0, connect=10.0)


def _slave_base_url(slave: SlaveORM) -> str:
    return f"http://{slave.hostname}:{slave.port}"


def _slave_headers(slave: SlaveORM) -> dict[str, str]:
    return {"X-Slave-Token": slave.api_key}


def slave_request(
    slave: SlaveORM,
    method: str,
    path: str,
    json: Optional[dict] = None,
) -> dict:
    """Make an HTTP request to a slave node."""
    url = f"{_slave_base_url(slave)}{path}"
    headers = _slave_headers(slave)
    with httpx.Client(timeout=TIMEOUT) as client:
        response = client.request(method, url, headers=headers, json=json)
        response.raise_for_status()
        if response.status_code == 204:
            return {}
        return response.json()


def slave_create_vm(slave: SlaveORM, vm_payload: dict) -> dict:
    """Create a VM on a slave node."""
    return slave_request(slave, "POST", "/vms", json=vm_payload)


def slave_get_vm(slave: SlaveORM, vm_id: str) -> dict:
    """Get VM info from a slave node."""
    return slave_request(slave, "GET", f"/vms/{vm_id}")


def slave_start_vm(slave: SlaveORM, vm_id: str) -> dict:
    """Start a VM on a slave node."""
    return slave_request(slave, "POST", f"/vms/{vm_id}/start")


def slave_stop_vm(slave: SlaveORM, vm_id: str) -> dict:
    """Stop a VM on a slave node."""
    return slave_request(slave, "POST", f"/vms/{vm_id}/stop")


def slave_delete_vm(slave: SlaveORM, vm_id: str) -> dict:
    """Delete a VM on a slave node."""
    return slave_request(slave, "DELETE", f"/vms/{vm_id}")


def slave_get_host_info(slave: SlaveORM) -> dict:
    """Get host info from a slave node."""
    return slave_request(slave, "GET", "/host/info")
