from fastapi import APIRouter, Depends, status
from app.services.image_service import ImageService
from app.models.image import ImageRead
from app.models.user_management import MissingPoliciesResponse
from app.utils.auth import require_policy


router = APIRouter()


@router.get("/", status_code=status.HTTP_200_OK,
            response_model=list[ImageRead],
            dependencies=[Depends(require_policy("images:get"))],
            responses={403: {"model": MissingPoliciesResponse}})
def get_distribox_image_list():
    try:
        return ImageService.get_distribox_image_list()
    except Exception:
        raise
