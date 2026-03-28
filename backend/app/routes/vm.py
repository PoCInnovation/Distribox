import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlmodel import Session
from app.models.user_management import MissingPoliciesResponse
from app.models.vm import VmCreate, VmRead, VmCredentialCreateRequest, VmCredentialRead, RecoverableVm, RecoverableVmCreate
from app.services.vm_service import VmService
from app.services.vm_screenshot import capture_screenshot
from app.utils.auth import require_policy, decode_access_token, user_has_policy
from app.orm.user import UserORM
from app.core.config import engine

router = APIRouter()


@router.get("/{vm_id}/screenshot",
            status_code=status.HTTP_200_OK,
            responses={200: {"content": {"image/jpeg": {}},
                             "description": "JPEG thumbnail of the VM screen"},
                       },
            )
async def get_vm_screenshot(vm_id: str, token: str = Query(...)):
    """Screenshot endpoint using query-param JWT auth (for <img src=> usage)."""
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            "Invalid or expired token")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            "Invalid token payload")
    with Session(engine) as session:
        user = session.get(UserORM, user_id)
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        if not user_has_policy(user, "vms:screenshot"):
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                "Missing vms:screenshot policy")
    slave = await asyncio.to_thread(VmService._get_slave_for_vm, vm_id)
    if slave:
        from app.services.slave_client import slave_get_screenshot
        jpeg_bytes = await asyncio.to_thread(slave_get_screenshot, slave, vm_id)
    else:
        jpeg_bytes = await asyncio.to_thread(capture_screenshot, vm_id)
    return Response(
        content=jpeg_bytes,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@router.post(
    "/{vm_id}/duplicate",
    status_code=status.HTTP_200_OK,
    response_model=VmRead,
    dependencies=[Depends(require_policy("vms:duplicate"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def duplicate_vm(vm_id: str):
    return VmService.duplicate_vm(vm_id)


@router.delete(
    "/clean/{vm_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_policy("vms:cleanRecoverableVmById"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def remove_recoverable_vm(vm_id: str):
    return VmService.remove_recoverable_vm(vm_id)


@router.delete(
    "/cleanall",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_policy("vms:cleanAllRecoverableVms"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def remove_all_recoverable_vms():
    return VmService.remove_all_recoverable_vms()


@router.post("/recover",
             status_code=status.HTTP_201_CREATED,
             response_model=VmRead,
             dependencies=[Depends(require_policy("vms:recoverVmById"))],
             responses={403: {"model": MissingPoliciesResponse}},
             )
def recover_vm(vm: RecoverableVmCreate):
    return VmService.recover_vm(vm)


@router.get(
    "/recoverable",
    status_code=status.HTTP_200_OK,
    response_model=list[RecoverableVm],
    dependencies=[Depends(require_policy("vms:getRecoverableVms"))],
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


@router.post("/{vm_id}/restart",
             status_code=status.HTTP_200_OK,
             response_model=VmRead,
             dependencies=[Depends(require_policy("vms:start")),
                           Depends(require_policy("vms:stop"))],
             responses={403: {"model": MissingPoliciesResponse}})
def restart_vm(vm_id: str):
    vm = VmService.restart_vm(vm_id)
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
