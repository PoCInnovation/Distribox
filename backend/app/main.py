from typing import Union
from fastapi import FastAPI, HTTPException, status

from app.models.vm import VmCreate
from app.services.vm_service import VmService

app = FastAPI()

@app.post("/vms", status_code=status.HTTP_201_CREATED)
def create_vm(vm:VmCreate):
    try:
        created_vm = VmService.create_vm(vm)
    except Exception as e:
        raise
        # raise HTTPException(
            # status_code=status.HTTP_400_BAD_REQUEST,
            # detail=str(e)
        # )
    return created_vm
