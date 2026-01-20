from pydantic import BaseModel
from app.models.resources import MemoryInfoBase, DiskInfoBase, CPUInfoBase


class DiskInfoHost(DiskInfoBase):
    distribox_used: float


class MemoryInfoHost(MemoryInfoBase):
    pass


class CPUInfoHost(CPUInfoBase):
    pass


class HostInfoBase(BaseModel):
    disk: DiskInfoHost
    mem: MemoryInfoHost
    cpu: CPUInfoHost
