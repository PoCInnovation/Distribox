from fastapi import  status, APIRouter, HTTPException
from app.models.vm import VmCreate
from app.services.vm_service import VmService

router = APIRouter()

@router.get("/{vm_id}", status_code=status.HTTP_200_OK)
def get_vm(vm_id: str):
    try:
        vm = VmService.get_vm(vm_id)
    except Exception:
        raise
    return vm

@router.post("/{vm_id}/start", status_code=status.HTTP_200_OK)
def start_vm(vm_id: str):
    try:
        vm = VmService.start_vm(vm_id)
    except Exception:
        raise
    return vm

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_vm(vm:VmCreate):
    try:
        created_vm = VmService.create_vm(vm)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    return created_vm