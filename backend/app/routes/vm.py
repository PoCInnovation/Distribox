from fastapi import APIRouter, Depends, status
from app.models.user_management import MissingPoliciesResponse
from app.models.vm import VmCreate, VmRead, PasswordCreated
from app.services.vm_service import VmService
from app.utils.auth import require_policy

router = APIRouter()


@router.get(
    '/',
    status_code=status.HTTP_200_OK,
    response_model=list[VmRead],
    dependencies=[Depends(require_policy("vms:get"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def get_vm_list():
    vm_list = VmService.get_vm_list()
    return vm_list


@router.get(
    "/{vm_id}",
    status_code=status.HTTP_200_OK,
    response_model=VmRead,
    dependencies=[Depends(require_policy("vms:getById"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def get_vm(vm_id: str):
    vm = VmService.get_vm(vm_id)
    return vm


@router.post("/{vm_id}/start",
             status_code=status.HTTP_200_OK,
             response_model=VmRead,
             dependencies=[Depends(require_policy("vms:start"))],
             responses={403: {"model": MissingPoliciesResponse}})
def start_vm(vm_id: str):
    vm = VmService.start_vm(vm_id)
    return vm


@router.post("/{vm_id}/stop",
             status_code=status.HTTP_200_OK,
             response_model=VmRead,
             dependencies=[Depends(require_policy("vms:stop"))],
             responses={403: {"model": MissingPoliciesResponse}})
def stop_vm(vm_id: str):
    vm = VmService.stop_vm(vm_id)
    return vm


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    response_model=VmRead,
    dependencies=[Depends(require_policy("vms:create"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def create_vm(vm: VmCreate):
    created_vm = VmService.create_vm(vm)
    return created_vm


@router.put("/{vm_id}/password",
            status_code=status.HTTP_200_OK,
            response_model=PasswordCreated,
            dependencies=[Depends(require_policy("vms:updatePassword"))],
            responses={403: {"model": MissingPoliciesResponse}})
def set_vm_password(vm_id):
    return VmService.set_vm_password(vm_id)


@router.delete(
    "/{vm_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_policy("vms:delete"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def remove_vm(vm_id: str):
    VmService.remove_vm(vm_id)


@router.delete(
    "/{vm_id}/password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_policy("vms:deletePassword"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def remove_vm_password(vm_id: str):
    VmService.remove_vm_password(vm_id)
