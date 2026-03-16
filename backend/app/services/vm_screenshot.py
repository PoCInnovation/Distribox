import io
import logging

import libvirt
from PIL import Image
from fastapi import HTTPException, status

from app.core.config import QEMUConfig

logger = logging.getLogger(__name__)

THUMBNAIL_WIDTH = 960
THUMBNAIL_HEIGHT = 540
JPEG_QUALITY = 70


def capture_screenshot(vm_id: str) -> bytes:
    """Capture a JPEG screenshot of a running VM via libvirt.

    Uses ``virDomainScreenshot`` which reads the framebuffer directly —
    no VNC or guacd needed.  The raw image (PPM/PNG depending on the
    hypervisor) is resized to a small thumbnail and JPEG-compressed.
    """
    conn = QEMUConfig.get_connection()

    try:
        domain = conn.lookupByName(vm_id)
    except libvirt.libvirtError as exc:
        if exc.get_error_code() == libvirt.VIR_ERR_NO_DOMAIN:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"VM {vm_id} not found")
        raise

    if not domain.isActive():
        raise HTTPException(status.HTTP_409_CONFLICT, "VM is not running")

    stream = conn.newStream()
    try:
        mime = domain.screenshot(stream, 0)
        logger.debug("Screenshot MIME type for %s: %s", vm_id, mime)
    except libvirt.libvirtError as exc:
        stream.abort()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to capture screenshot: {exc}",
        )

    raw = io.BytesIO()

    def _recv_handler(stream: libvirt.virStream, buf: bytes, _opaque: object) -> int:
        raw.write(buf)
        return 0

    try:
        stream.recvAll(_recv_handler, None)
        stream.finish()
    except libvirt.libvirtError as exc:
        stream.abort()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Screenshot stream error: {exc}",
        )

    raw.seek(0)
    img = Image.open(raw)
    img.thumbnail((THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT))

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=JPEG_QUALITY)
    return out.getvalue()
