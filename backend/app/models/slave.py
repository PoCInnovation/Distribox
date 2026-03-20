from typing import Optional
from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime


class SlaveCreate(BaseModel):
    name: str = Field(min_length=1)
    hostname: str = Field(min_length=1)
    port: int = Field(default=8080, ge=1, le=65535)


class SlaveRead(BaseModel):
    id: UUID
    name: str
    hostname: str
    port: int
    api_key: str
    status: str
    last_heartbeat: Optional[datetime] = None
    total_cpu: int
    total_mem: int
    total_disk: int
    available_cpu: float
    available_mem: float
    available_disk: float


class SlaveHeartbeat(BaseModel):
    total_cpu: int
    total_mem: int
    total_disk: int
    available_cpu: float
    available_mem: float
    available_disk: float


class SlaveHostInfo(BaseModel):
    """Response from a slave's /host/info endpoint."""
    disk: dict
    mem: dict
    cpu: dict
