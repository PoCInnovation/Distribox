from sqlmodel import SQLModel, Field
from datetime import datetime
import uuid


class EventORM(SQLModel, table=True):
    __tablename__ = "events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    slug: str = Field(unique=True, index=True)
    name: str
    vm_os: str
    vm_distribution: str = Field(default="")
    vm_mem: int
    vm_vcpus: int
    vm_disk_size: int
    deadline: datetime
    max_vms: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str


class EventParticipantORM(SQLModel, table=True):
    __tablename__ = "event_participants"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    event_id: uuid.UUID = Field(foreign_key="events.id")
    participant_name: str
    vm_id: uuid.UUID = Field(foreign_key="vms.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
