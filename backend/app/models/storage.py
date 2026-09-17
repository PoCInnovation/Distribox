from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StorageLocationRead(BaseModel):
    id: str
    name: str
    path: str
    total_gib: float
    available_gib: float
    available: bool
    reason: str | None = None
    enabled: bool = True
    managed: bool = False


class StorageOverview(BaseModel):
    locations: list[StorageLocationRead]
    recommended_id: str | None = None


class StorageCandidate(BaseModel):
    id: str
    mount_path: str
    filesystem: str
    total_gib: float
    available_gib: float
    available: bool
    reason: str | None = None
    configured_storage_id: str | None = None


class StorageSettings(BaseModel):
    locations: list[StorageLocationRead]
    candidates: list[StorageCandidate]
    discovery_error: str | None = None


class StorageAdd(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    mount_id: str = Field(min_length=1, max_length=128,
                          pattern=r"^[a-zA-Z0-9_-]+$")
    name: str | None = Field(default=None, min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        if value is not None:
            value = value.strip()
            if not value or any(ord(character) < 32 for character in value):
                raise ValueError(
                    "Choose a nonempty display name without control characters")
        return value


class StorageUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str | None = Field(default=None, min_length=1, max_length=80)
    enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        return StorageAdd.valid_name(value)

    @model_validator(mode="after")
    def require_change(self):
        if self.name is None and self.enabled is None:
            raise ValueError("Provide a display name or an enabled setting")
        return self
