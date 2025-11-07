from fastapi import FastAPI
from app.routes import vms 

app = FastAPI()

app.include_router(vms.router, prefix="/vms")
