from fastapi import APIRouter, status
from app.services.host_service import HostService
from app.models.host import HostInfoBase


router = APIRouter()

@router.get("/info", status_code=status.HTTP_200_OK, response_model=HostInfoBase)
def get_host_info():
    return HostService.get_host_info()