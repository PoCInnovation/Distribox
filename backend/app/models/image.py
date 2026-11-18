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
    # Uploaded images only: whether they have what SSH needs, and why not.
    ssh_ready: Optional[bool] = None
    ssh_detail: Optional[str] = None

    @field_validator("version", mode="before")
    @classmethod
    def version_to_str(cls, v):
        return str(v)


class ImageRead(ImageBase):
    pass


class CatalogImage(ImageRead):
    min_disk_size: int | None


class ImageUpload(BaseModel):
    name: str = Field(min_length=1)
    distribution: str = "custom"
    version: str = "custom"
    firmware: Literal["bios", "efi"] = "bios"


class ImageUploadStatus(BaseModel):
    status: Literal["converting", "preparing", "ready", "failed"]
    detail: Optional[str] = None
