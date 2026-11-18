from datetime import datetime, timezone
from typing import Any, Optional
import uuid
from sqlalchemy import JSON, BigInteger, Column
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class OperationORM(SQLModel, table=True):
    __tablename__ = "operations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    kind: str
    status: str = Field(default="running")
    name: str
    vm_id: Optional[uuid.UUID] = Field(default=None)
    # No foreign key: the record outlives a slave that gets unregistered.
    slave_id: Optional[uuid.UUID] = Field(default=None)
    slave_name: Optional[str] = Field(default=None)
    params: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    phases: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    phase: str
    phase_started_at: datetime = Field(default_factory=_now)
    bytes_done: Optional[int] = Field(
        default=None, sa_column=Column(BigInteger, nullable=True))
    bytes_total: Optional[int] = Field(
        default=None, sa_column=Column(BigInteger, nullable=True))
    error: Optional[str] = Field(default=None)
    created_by: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    finished_at: Optional[datetime] = Field(default=None)
