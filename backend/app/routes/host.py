from fastapi import APIRouter, status
from app.services.host_service import HostService


router = APIRouter()

@router.get("/info", status_code=status.HTTP_200_OK)
def get_host_info():
    return HostService.get_host_info()