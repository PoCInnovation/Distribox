from pydantic import BaseModel
from typing import Optional

class VmBase(BaseModel):
    os: str
    mem: int
    vcpus: int
    disk_size: int

class VmRead(VmBase):
    id: str
    state: str

class VmCreate(VmBase):
    pass
