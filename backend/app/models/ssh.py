from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SshSettings(BaseModel):
    enabled: bool
    available: bool
    host: str | None
    port: int
    host_key_fingerprint: str | None


class SshSettingsUpdate(BaseModel):
    enabled: bool


class SshConnectionRequest(BaseModel):
    credential: str = Field(min_length=1, max_length=1024)


class SshConnection(SshSettings):
    credential_id: UUID
    vm_name: str
    expires_at: datetime | None
