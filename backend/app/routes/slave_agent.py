"""Slave-side API routes. These run on slave nodes and are called by the Master.

All endpoints require X-Slave-Token authentication.
"""
from fastapi import APIRouter, Depends, Response, status
from app.models.vm import VmCreate, VmRead
from app.services.vm_service import VmService
from app.services.host_service import HostService
from app.services.vm_screenshot import capture_screenshot
from app.utils.vnc import get_vnc_port
from app.utils.slave_auth import require_slave_token

router = APIRouter()


@router.post(
    "/vms",
    status_code=status.HTTP_201_CREATED,
    response_model=VmRead,
    dependencies=[Depends(require_slave_token)],
)
def create_vm(vm: VmCreate):
    return VmService.create_vm(vm)


@router.get(
    "/vms/{vm_id}",
    status_code=status.HTTP_200_OK,
    response_model=VmRead,
    dependencies=[Depends(require_slave_token)],
)
def get_vm(vm_id: str):
    return VmService.get_vm(vm_id)


@router.post(
    "/vms/{vm_id}/start",
    status_code=status.HTTP_200_OK,
    response_model=VmRead,
    dependencies=[Depends(require_slave_token)],
)
def start_vm(vm_id: str):
    return VmService.start_vm(vm_id)


@router.post(
    "/vms/{vm_id}/stop",
    status_code=status.HTTP_200_OK,
    response_model=VmRead,
    dependencies=[Depends(require_slave_token)],
)
def stop_vm(vm_id: str):
    return VmService.stop_vm(vm_id)


@router.delete(
    "/vms/{vm_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_slave_token)],
)
def delete_vm(vm_id: str):
    VmService.remove_vm(vm_id)


@router.get(
    "/vms/{vm_id}/vnc-port",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_slave_token)],
)
def get_vm_vnc_port(vm_id: str):
    port = get_vnc_port(vm_id)
    return {"port": port}


@router.get(
    "/vms/{vm_id}/screenshot",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_slave_token)],
)
def get_vm_screenshot(vm_id: str):
    jpeg_bytes = capture_screenshot(vm_id)
    return Response(
        content=jpeg_bytes,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@router.get(
    "/host/info",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_slave_token)],
)
def get_host_info():
    return HostService.get_host_info()
