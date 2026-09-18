from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


class ImageBase(BaseModel):
    name: str
    image: str
    version: str
    distribution: str
    family: str
    revision: int
    firmware: str = "bios"

    @field_validator("version", mode="before")
    @classmethod
    def version_to_str(cls, v):
        return str(v)


class ImageRead(ImageBase):
    pass


class ImageUpload(BaseModel):
    name: str = Field(min_length=1)
    distribution: str = "custom"
    version: str = "custom"
    firmware: Literal["bios", "efi"] = "bios"


class ImageUploadStatus(BaseModel):
    status: Literal["converting", "ready", "failed"]
    detail: Optional[str] = None
