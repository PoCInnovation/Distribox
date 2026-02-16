from sqlmodel import SQLModel, Field
import uuid
from typing import Optional


class VmORM(SQLModel, table=True, ):
    __tablename__ = "vms"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    os: str
    mem: int
    vcpus: int
    disk_size: int
    password: Optional[str] = None
