from typing import Union
from fastapi import FastAPI, status
from app.models.vm import VmCreate
from app.services.vm_service import VmService
from app.routes import vms 

app = FastAPI()

app.include_router(vms.router, prefix="/vms")
