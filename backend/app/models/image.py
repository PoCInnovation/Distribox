from pydantic import BaseModel

class ImageBase(BaseModel):
    name: str
    virtual_size: float
    actual_size: float

class ImageRead(ImageBase):
    pass