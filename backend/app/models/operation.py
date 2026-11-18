from datetime import datetime, timezone
from typing import Any, Literal, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, computed_field, field_validator

OperationStatus = Literal["running", "succeeded", "failed", "interrupted"]


class OperationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: str
    status: OperationStatus
    name: str
    vm_id: Optional[UUID]
    slave_id: Optional[UUID]
    slave_name: Optional[str]
    params: dict[str, Any]
    phases: list[str]
    phase: str
    phase_started_at: datetime
    bytes_done: Optional[int]
    bytes_total: Optional[int]
    error: Optional[str]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    finished_at: Optional[datetime]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def indeterminate(self) -> bool:
        return self.bytes_total is None

    @field_validator("phase_started_at", "created_at", "updated_at",
                     "finished_at")
    @classmethod
    def as_utc(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
