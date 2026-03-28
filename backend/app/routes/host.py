import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from app.services.host_service import HostService
from app.services.slave_service import SlaveService
from app.services.slave_client import slave_get_host_info
from app.models.host import HostInfoBase, ClusterHostInfo, ClusterTotals, NodeHostInfo
from app.models.user_management import MissingPoliciesResponse
from app.utils.auth import require_policy

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/info", status_code=status.HTTP_200_OK,
            response_model=HostInfoBase,
            dependencies=[Depends(require_policy("host:get"))],
            responses={403: {"model": MissingPoliciesResponse}})
def get_host_info():
    return HostService.get_host_info()


@router.get("/info/slave/{slave_id}", status_code=status.HTTP_200_OK,
            response_model=HostInfoBase,
            dependencies=[Depends(require_policy("host:get"))],
            responses={403: {"model": MissingPoliciesResponse}})
def get_slave_host_info(slave_id: UUID):
    slave = SlaveService.get_slave(str(slave_id))
    if not slave:
        raise HTTPException(status_code=404, detail="Slave not found")
    if slave.status != "online":
        raise HTTPException(status_code=503, detail="Slave is offline")
    return slave_get_host_info(slave)


@router.get("/info/cluster", status_code=status.HTTP_200_OK,
            response_model=ClusterHostInfo,
            dependencies=[Depends(require_policy("host:get"))],
            responses={403: {"model": MissingPoliciesResponse}})
def get_cluster_host_info():
    master_info = HostService.get_host_info()
    nodes = [NodeHostInfo(node_id=None, node_name="Master", host_info=master_info)]

    totals_cpu = master_info.cpu.cpu_count
    totals_mem_total = master_info.mem.total
    totals_mem_available = master_info.mem.available
    totals_disk_total = master_info.disk.total
    totals_disk_available = master_info.disk.available

    for slave in SlaveService.get_online_slaves():
        try:
            info = slave_get_host_info(slave)
            slave_host_info = HostInfoBase(**info)
            nodes.append(NodeHostInfo(
                node_id=slave.id,
                node_name=slave.name,
                host_info=slave_host_info,
            ))
            totals_cpu += slave_host_info.cpu.cpu_count
            totals_mem_total += slave_host_info.mem.total
            totals_mem_available += slave_host_info.mem.available
            totals_disk_total += slave_host_info.disk.total
            totals_disk_available += slave_host_info.disk.available
        except Exception:
            logger.warning("Failed to get host info from slave %s", slave.name)

    return ClusterHostInfo(
        nodes=nodes,
        totals=ClusterTotals(
            cpu_count=totals_cpu,
            mem_total=round(totals_mem_total, 2),
            mem_available=round(totals_mem_available, 2),
            disk_total=round(totals_disk_total, 2),
            disk_available=round(totals_disk_available, 2),
        ),
    )
