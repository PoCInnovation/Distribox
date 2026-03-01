from pydantic import BaseModel, field_validator


class ImageBase(BaseModel):
    name: str
    image: str
    version: str
    distribution: str
    family: str
    revision: int

    @field_validator("version", mode="before")
    @classmethod
    def version_to_str(cls, v):
        return str(v)


class ImageRead(ImageBase):
    pass
