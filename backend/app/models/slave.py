import ipaddress
import re
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

_HOSTNAME_RE = re.compile(r"^[a-zA-Z0-9.\-_:[\]]+$")


def _validate_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Name cannot be empty")
    return cleaned


def _validate_hostname(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Hostname cannot be empty")
    if not _HOSTNAME_RE.fullmatch(cleaned):
        raise ValueError(
            "Hostname must be a hostname or IP address without scheme or path"
        )
    if ":" in cleaned:
        unbracketed = (
            cleaned[1:-1]
            if cleaned.startswith("[") and cleaned.endswith("]")
            else cleaned
        )
        try:
            ipaddress.IPv6Address(unbracketed)
        except ValueError as exc:
            raise ValueError(
                "Hostname must be a hostname or IP address without port"
            ) from exc
        return unbracketed
    if "[" in cleaned or "]" in cleaned:
        raise ValueError(
            "Hostname must be a hostname or IP address without brackets"
        )
    return cleaned


class SlaveCreate(BaseModel):
    name: str = Field(min_length=1)
    hostname: str = Field(min_length=1)
    port: int = Field(default=8080, ge=1, le=65535)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _validate_name(value)

    @field_validator("hostname")
    @classmethod
    def validate_hostname(cls, value: str) -> str:
        return _validate_hostname(value)


class SlaveUpdate(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None
    port: Optional[int] = Field(default=None, ge=1, le=65535)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> str:
        if value is None:
            raise ValueError("Name cannot be null")
        return _validate_name(value)

    @field_validator("hostname")
    @classmethod
    def validate_hostname(cls, value: Optional[str]) -> str:
        if value is None:
            raise ValueError("Hostname cannot be null")
        return _validate_hostname(value)

    @field_validator("port")
    @classmethod
    def validate_port(cls, value: Optional[int]) -> int:
        if value is None:
            raise ValueError("Port cannot be null")
        return value


class SlaveRead(BaseModel):
    id: UUID
    name: str
    hostname: str
    port: int
    api_key: Optional[str] = None
    status: str
    created_at: datetime
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
