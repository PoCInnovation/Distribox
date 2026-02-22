from pydantic import BaseModel


class ImageBase(BaseModel):
    name: str
    image: str
    version: str
    distribution: str
    family: str
    revision: int


class ImageRead(ImageBase):
    pass
