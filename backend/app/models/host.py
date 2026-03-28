from typing import Optional
from uuid import UUID
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


class NodeHostInfo(BaseModel):
    node_id: Optional[UUID] = None
    node_name: str
    host_info: HostInfoBase


class ClusterHostInfo(BaseModel):
    nodes: list[NodeHostInfo]
    totals: "ClusterTotals"


class ClusterTotals(BaseModel):
    cpu_count: int
    mem_total: float
    mem_available: float
    disk_total: float
    disk_available: float
