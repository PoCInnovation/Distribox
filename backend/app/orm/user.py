from datetime import datetime
import uuid
from typing import Optional
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class UserORM(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    username: str = Field(unique=True, index=True)
    hashed_password: str
    password: Optional[str] = Field(default=None)
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = Field(default=None)
    last_activity: Optional[datetime] = Field(default=None)
    policies: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
