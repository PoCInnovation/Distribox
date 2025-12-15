from pydantic import BaseModel

class ImageBase(BaseModel):
    name: str
    virtual_size: int
    actual_size: int

class ImageRead(ImageBase):
    pass