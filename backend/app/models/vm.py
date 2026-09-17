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
    disk_size: int = Field(ge=1)
    keyboard_layout: Optional[str] = None
    ssh_enabled: bool = False
    storage_id: str = "default"


class VmRead(VmBase):
    id: UUID
    state: str
    ipv4: Optional[str]
    credentials_count: int = 0
    slave_id: Optional[UUID] = None
    slave_name: Optional[str] = None
    storage_path: Optional[str] = None


class VmCreate(VmBase):
    storage_id: Optional[str] = None
    activate_at_start: bool
    slave_id: Optional[UUID] = None
    auto_place: bool = False


class VmCreateXML(VmBase):
    id: UUID


class VmRename(BaseModel):
    name: str


class VmCredentialCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    password: Optional[str] = None
    expires_at: Optional[datetime] = None


class VmCredentialRead(BaseModel):
    id: UUID
    vm_id: UUID
    name: str
    password: str
    created_at: datetime
    expires_at: Optional[datetime] = None


class RecoverableVm(ImageRead):
    vm_id: str
    storage_id: str = "default"
    storage_path: Optional[str] = None


class RecoverableVmCreate(BaseModel):
    vm_id: UUID
    name: str
    mem: int
    vcpus: int
    disk_size: int = Field(ge=1)
    storage_id: Optional[str] = None
