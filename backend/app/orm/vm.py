from sqlmodel import SQLModel, Field
import uuid

class VmORM(SQLModel, table=True, ):
    __tablename__ = "vms"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    os: str
    mem: int
    vcpus: int
    disk_size: int