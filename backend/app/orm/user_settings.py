import uuid
from typing import Optional
from sqlmodel import Field, SQLModel


class UserSettingsORM(SQLModel, table=True):
    __tablename__ = "user_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)
    default_vcpus: Optional[int] = Field(default=None)
    default_mem: Optional[int] = Field(default=None)
    default_disk_size: Optional[int] = Field(default=None)
    default_os: Optional[str] = Field(default=None)
    default_keyboard_layout: Optional[str] = Field(default=None)
    timezone: str = Field(default="auto")
