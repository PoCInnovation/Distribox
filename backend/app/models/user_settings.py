from typing import Optional
from pydantic import BaseModel


class UserSettingsResponse(BaseModel):
    default_vcpus: Optional[int] = None
    default_mem: Optional[int] = None
    default_disk_size: Optional[int] = None
    default_os: Optional[str] = None
    default_keyboard_layout: Optional[str] = None
    timezone: str = "auto"


class UpdateUserSettingsRequest(BaseModel):
    default_vcpus: Optional[int] = None
    default_mem: Optional[int] = None
    default_disk_size: Optional[int] = None
    default_os: Optional[str] = None
    default_keyboard_layout: Optional[str] = None
    timezone: Optional[str] = None
