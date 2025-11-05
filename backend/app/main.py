from typing import Union
from fastapi import FastAPI, HTTPException, status

from app.models.vm import VmCreate
from app.services.vm_service import VmService

app = FastAPI()

@app.get("/vms/{vm_id}", status_code=status.HTTP_200_OK)
def get_vm(vm_id: str):
    try:
        vm = VmService.get_vm(vm_id)
    except Exception:
        raise
    return vm

@app.post("/vms/{vm_id}/start", status_code=status.HTTP_200_OK)
def start_vm(vm_id: str):
    try:
        vm = VmService.start_vm(vm_id)
    except Exception:
        raise
    return vm

@app.post("/vms", status_code=status.HTTP_201_CREATED)
def create_vm(vm:VmCreate):
    try:
        created_vm = VmService.create_vm(vm)
    except Exception as e:
        raise
        # raise HTTPException(
        #     status_code=status.HTTP_400_BAD_REQUEST,
        #     detail=str(e)
        # )
    return created_vm
