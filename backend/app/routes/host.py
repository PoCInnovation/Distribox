from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from app.services.host_service import HostService
from app.services.slave_service import SlaveService
from app.services.slave_client import slave_get_host_info
from app.models.host import HostInfoBase
from app.models.user_management import MissingPoliciesResponse
from app.utils.auth import require_policy


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
    slave = SlaveService.get_slave(slave_id)
    if not slave:
        raise HTTPException(status_code=404, detail="Slave not found")
    if slave.status != "online":
        raise HTTPException(status_code=503, detail="Slave is offline")
    return slave_get_host_info(slave)
