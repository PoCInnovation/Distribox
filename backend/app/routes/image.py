from fastapi import APIRouter, status
from app.services.image_service import ImageService


router = APIRouter()

@router.get("/", status_code=status.HTTP_200_OK)
def get_distribox_image_list():
    try:
        return ImageService.get_distribox_image_list()
    except Exception:
        raise