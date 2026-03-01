from fastapi import APIRouter, Depends, status
from app.models.user_management import MissingPoliciesResponse
from app.models.vm import VmCreate, VmRead, VmCredentialCreateRequest, VmCredentialRead, RecoverableVm
from app.services.vm_service import VmService
from app.utils.auth import require_policy

router = APIRouter()


@router.get(
    "/recoverable",
    status_code=status.HTTP_200_OK,
    response_model=list[RecoverableVm],
    dependencies=[Depends(require_policy("vms:getById"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def get_recoverable_vms():
    return VmService.get_recoverable_vms()


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


@router.post(
    "/{vm_id}/credentials/create",
    status_code=status.HTTP_201_CREATED,
    response_model=VmCredentialRead,
    dependencies=[Depends(require_policy("vms:credentials:create"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def create_vm_credential(vm_id: str, payload: VmCredentialCreateRequest):
    return VmService.create_vm_credential(vm_id, payload)


@router.delete(
    "/{vm_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_policy("vms:delete"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def remove_vm(vm_id: str):
    VmService.remove_vm(vm_id)


@router.delete(
    "/{vm_id}/credentials/revoke/{credential_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_policy("vms:credentials:revoke"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def revoke_vm_credential(vm_id: str, credential_id: str):
    VmService.revoke_vm_credential(vm_id, credential_id)


@router.get(
    "/{vm_id}/credentials",
    status_code=status.HTTP_200_OK,
    response_model=list[VmCredentialRead],
    dependencies=[Depends(require_policy("vms:credentials:list"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def list_vm_credentials(vm_id: str):
    return VmService.list_vm_credentials(vm_id)


@router.get(
    "/{vm_id}/credentials/{credential_id}",
    status_code=status.HTTP_200_OK,
    response_model=VmCredentialRead,
    dependencies=[Depends(require_policy("vms:credentials:getById"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def get_vm_credential(vm_id: str, credential_id: str):
    return VmService.get_vm_credential(vm_id, credential_id)
