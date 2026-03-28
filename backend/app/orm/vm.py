from typing import Optional
from sqlmodel import SQLModel, Field
import uuid


class VmORM(SQLModel, table=True, ):
    __tablename__ = "vms"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    os: str
    mem: int
    vcpus: int
    disk_size: int
    keyboard_layout: Optional[str] = Field(default=None)
    slave_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="slaves.id")
