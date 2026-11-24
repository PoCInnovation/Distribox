"""HTTP client for Master -> Slave communication."""
import logging
from typing import Any, Optional
import httpx
from fastapi import HTTPException, status
from app.orm.slave import SlaveORM

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(120.0, connect=10.0)
# Creations run in a background operation, so only a hung slave should end one.
VM_CREATE_TIMEOUT = httpx.Timeout(3600.0, connect=10.0)
# Placement probes run before POST /vms/ answers, so they must stay short.
PROBE_TIMEOUT = httpx.Timeout(5.0, connect=3.0)


class SlaveUnreachableError(HTTPException):
    """Raised when the master cannot reach a slave node over the network."""

    def __init__(
        self,
        status_code: int,
        detail: str,
        *,
        slave_name: Optional[str] = None,
        address: Optional[str] = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.slave_name = slave_name
        self.address = address


def slave_address(slave: Any) -> str:
    host = slave.hostname
    if ":" in host and not (host.startswith("[") and host.endswith("]")):
        host = f"[{host}]"
    return f"{host}:{slave.port}"


def _slave_label(slave: Any) -> str:
    address = slave_address(slave)
    name = getattr(slave, "name", None)
    if name:
        return f"slave '{name}' at {address}"
    return f"slave at {address}"


def _connection_error_reason(exc: Exception) -> str:
    if isinstance(exc, (httpx.ConnectTimeout, TimeoutError)):
        return "connection timed out"
    if isinstance(exc, httpx.TimeoutException):
        return "request timed out"
    message = str(exc).strip()
    return message or "connection failed"


def unreachable_slave_detail(slave: Any, exc: Exception) -> str:
    label = _slave_label(slave)
    if isinstance(exc, httpx.TimeoutException) and not isinstance(
        exc, httpx.ConnectTimeout
    ):
        return f"Slave '{slave.name}' at {slave_address(slave)} timed out" if getattr(
            slave, "name", None
        ) else f"Slave at {slave_address(slave)} timed out"
    return f"Cannot reach {label}: {_connection_error_reason(exc)}"


def _slave_base_url(slave: SlaveORM) -> str:
    return f"http://{slave_address(slave)}"


def _slave_headers(slave: SlaveORM) -> dict[str, str]:
    return {"X-Slave-Token": slave.api_key}


def _send_slave_request(
    slave: SlaveORM,
    method: str,
    path: str,
    *,
    json: Optional[dict] = None,
    timeout: Optional[httpx.Timeout] = None,
) -> httpx.Response:
    url = f"{_slave_base_url(slave)}{path}"
    headers = _slave_headers(slave)
    try:
        with httpx.Client(timeout=timeout or TIMEOUT) as client:
            response = client.request(method, url, headers=headers, json=json)
    except httpx.TimeoutException as exc:
        detail = unreachable_slave_detail(slave, exc)
        logger.warning("%s (%s %s)", detail, method, path)
        raise SlaveUnreachableError(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=detail,
            slave_name=getattr(slave, "name", None),
            address=slave_address(slave),
        ) from exc
    except (httpx.RequestError, httpx.InvalidURL) as exc:
        detail = unreachable_slave_detail(slave, exc)
        logger.warning("%s (%s %s)", detail, method, path)
        raise SlaveUnreachableError(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
            slave_name=getattr(slave, "name", None),
            address=slave_address(slave),
        ) from exc
    if response.is_error:
        try:
            detail = response.json().get("detail", response.text)
        except Exception:
            detail = response.text
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Slave error: {detail}",
        )
    return response


def slave_request(
    slave: SlaveORM,
    method: str,
    path: str,
    json: Optional[dict] = None,
    timeout: Optional[httpx.Timeout] = None,
) -> Any:
    """Make an HTTP request to a slave node."""
    response = _send_slave_request(
        slave, method, path, json=json, timeout=timeout
    )
    if response.status_code == 204:
        return {}
    return response.json()


def slave_create_vm(slave: SlaveORM, vm_payload: dict) -> dict:
    """Create a VM on a slave node."""
    return slave_request(slave, "POST", "/vms", json=vm_payload, timeout=VM_CREATE_TIMEOUT)


def slave_list_vms(slave: SlaveORM) -> list[dict]:
    """List the Distribox VMs a slave node hosts."""
    return slave_request(slave, "GET", "/vms")


def slave_get_vm(slave: SlaveORM, vm_id: str) -> dict:
    """Get VM info from a slave node."""
    return slave_request(slave, "GET", f"/vms/{vm_id}")


def slave_start_vm(slave: SlaveORM, vm_id: str) -> dict:
    """Start a VM on a slave node."""
    return slave_request(slave, "POST", f"/vms/{vm_id}/start")


def slave_stop_vm(slave: SlaveORM, vm_id: str, force: bool = False) -> dict:
    """Stop a VM on a slave node."""
    return slave_request(slave, "POST", f"/vms/{vm_id}/stop{'?force=true' if force else ''}")


def slave_delete_vm(slave: SlaveORM, vm_id: str) -> dict:
    """Delete a VM on a slave node."""
    return slave_request(slave, "DELETE", f"/vms/{vm_id}")


def slave_get_vnc_port(slave: SlaveORM, vm_id: str) -> int:
    """Get the VNC port for a VM on a slave node."""
    data = slave_request(slave, "GET", f"/vms/{vm_id}/vnc-port")
    return data["port"]


def slave_get_screenshot(slave: SlaveORM, vm_id: str) -> bytes:
    """Get a screenshot from a VM on a slave node."""
    response = _send_slave_request(slave, "GET", f"/vms/{vm_id}/screenshot")
    return response.content


def slave_get_host_info(slave: SlaveORM,
                        timeout: Optional[httpx.Timeout] = None) -> dict:
    """Get host info from a slave node."""
    return slave_request(slave, "GET", "/host/info", timeout=timeout)
