from typing import Optional
from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from app.models.image import ImageRead


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
    credentials_count: int = 0


class VmCreate(VmBase):
    activate_at_start: bool
    pass


class VmCredentialCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    password: Optional[str] = None


class VmCredentialRead(BaseModel):
    id: UUID
    vm_id: UUID
    name: str
    password: str
    created_at: datetime


class RecoverableVm(ImageRead):
    vm_id: str
