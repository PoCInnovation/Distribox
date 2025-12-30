from pydantic import BaseModel
from uuid import UUID

class VmBase(BaseModel):
    os: str
    mem: int
    vcpus: int
    disk_size: int

class VmRead(VmBase):
    id: UUID
    state: str

class VmCreate(VmBase):
    pass

class PasswordCreated(BaseModel):
    password: str