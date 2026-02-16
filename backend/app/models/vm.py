from typing import Optional
from pydantic import BaseModel
from uuid import UUID


class VmBase(BaseModel):
    os: str
    name: str
    mem: int
    vcpus: int
    disk_size: int


class VmRead(VmBase):
    id: UUID
    state: str
    ipv4: Optional[str]


class VmCreate(VmBase):
    activate_at_start: bool
    pass


class PasswordCreated(BaseModel):
    password: str
