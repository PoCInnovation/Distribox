"""Slave-side API routes. These run on slave nodes and are called by the Master.

All endpoints require X-Slave-Token authentication.
"""
from fastapi import APIRouter, Depends, status
from app.models.vm import VmCreate, VmRead
from app.services.vm_service import VmService
from app.services.host_service import HostService
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
    "/host/info",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_slave_token)],
)
def get_host_info():
    return HostService.get_host_info()
