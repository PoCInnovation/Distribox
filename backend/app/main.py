from typing import Union
from fastapi import FastAPI, HTTPException, status

from app.models.vm import VmCreate
from app.services.vm_service import VmService

app = FastAPI()


@app.post("/vms/{vm_id}/start")
def read_root(vm_id: str):
    try:
        VmService.start_vm(vm_id)
    except Exception as e:
        print(e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
    )
    # returns the started vm 

@app.post("/vms", status_code=status.HTTP_201_CREATED)
def create_vm(vm:VmCreate):
    try:
        created_vm = VmService.create_vm(vm)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    return created_vm
