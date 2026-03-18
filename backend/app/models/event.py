from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


class EventCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")
    vm_os: str
    vm_distribution: str = ""
    vm_mem: int = Field(gt=0)
    vm_vcpus: int = Field(gt=0)
    vm_disk_size: int = Field(gt=0)
    deadline: datetime
    max_vms: int = Field(gt=0)


class EventUpdate(BaseModel):
    name: Optional[str] = None
    vm_os: Optional[str] = None
    vm_distribution: Optional[str] = None
    vm_mem: Optional[int] = Field(default=None, gt=0)
    vm_vcpus: Optional[int] = Field(default=None, gt=0)
    vm_disk_size: Optional[int] = Field(default=None, gt=0)
    deadline: Optional[datetime] = None
    max_vms: Optional[int] = Field(default=None, gt=0)


class EventParticipantRead(BaseModel):
    id: UUID
    participant_name: str
    vm_id: UUID
    created_at: datetime


class EventRead(BaseModel):
    id: UUID
    slug: str
    name: str
    vm_os: str
    vm_distribution: str
    vm_mem: int
    vm_vcpus: int
    vm_disk_size: int
    deadline: datetime
    max_vms: int
    created_at: datetime
    created_by: str
    participants_count: int = 0
    participants: list[EventParticipantRead] = []


class EventJoinRequest(BaseModel):
    participant_name: str = Field(min_length=1, max_length=64)


class EventJoinResponse(BaseModel):
    vm_id: UUID
    vm_name: str
    credential_name: str
    credential_password: str
