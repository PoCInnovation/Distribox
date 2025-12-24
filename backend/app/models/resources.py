from pydantic import BaseModel

class ResourceStatsBase(BaseModel):
    total: float
    used: float
    available: float
    percent_used: float

class DiskInfoBase(ResourceStatsBase):
    pass  

class MemoryInfoBase(ResourceStatsBase):
    pass 

class CPUInfoBase(BaseModel):
    percent_used_total: float
    percent_used_per_cpu: list[float]
    cpu_count: int

