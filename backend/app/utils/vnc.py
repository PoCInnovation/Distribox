from lxml import etree
from fastapi import HTTPException, status
from app.core.config import QEMUConfig


def get_vnc_port(vm_id: str) -> int:
    conn = QEMUConfig.get_connection()
    domain = conn.lookupByName(vm_id)
    if not domain.isActive():
        raise HTTPException(status.HTTP_409_CONFLICT, "VM is not running")
    root = etree.fromstring(domain.XMLDesc().encode())
    vnc_el = root.find('.//graphics[@type="vnc"]')
    if vnc_el is None:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "No VNC display found"
        )
    port = int(vnc_el.get("port", "-1"))
    if port < 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "VNC port not yet assigned"
        )
    return port
