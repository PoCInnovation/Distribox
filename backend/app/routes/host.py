from fastapi import APIRouter, Depends, status
from app.services.host_service import HostService
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
