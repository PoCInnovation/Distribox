from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field
import uuid


class SlaveORM(SQLModel, table=True):
    __tablename__ = "slaves"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    hostname: str
    port: int = Field(default=8080)
    api_key: str
    status: str = Field(default="offline")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_heartbeat: Optional[datetime] = Field(default=None)
    total_cpu: int = Field(default=0)
    total_mem: int = Field(default=0)
    total_disk: int = Field(default=0)
    available_cpu: float = Field(default=0.0)
    available_mem: float = Field(default=0.0)
    available_disk: float = Field(default=0.0)
