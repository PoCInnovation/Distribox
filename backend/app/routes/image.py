from fastapi import APIRouter, status
from app.services.image_service import ImageService
from app.models.image import ImageRead


router = APIRouter()


@router.get("/", status_code=status.HTTP_200_OK,
            response_model=list[ImageRead])
def get_distribox_image_list():
    try:
        return ImageService.get_distribox_image_list()
    except Exception:
        raise
