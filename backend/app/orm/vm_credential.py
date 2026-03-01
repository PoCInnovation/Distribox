from datetime import datetime
import uuid

from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, SQLModel


class VmCredentialORM(SQLModel, table=True):
    __tablename__ = "vm_credentials"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    vm_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("vms.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    name: str
    password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
