from sqlmodel import SQLModel, Field
from sqlalchemy.dialects.postgresql import UUID
import uuid
from enum import Enum

class VmStatus(str, Enum):
    running = "running"
    stopped = "stopped"


class VmORM(SQLModel, table=True, ):
    __tablename__ = "vms"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    os: str
    mem: int
    vcpus: int
    disk_size: int
    status: VmStatus
