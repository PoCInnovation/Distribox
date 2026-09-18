from typing import Literal
from fastapi import APIRouter, Depends, Query, Request, status
from app.services.image_service import ImageService
from app.models.image import ImageRead, ImageUpload
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


@router.post("/upload", status_code=status.HTTP_201_CREATED,
             response_model=ImageRead,
             dependencies=[Depends(require_policy("images:upload"))],
             responses={403: {"model": MissingPoliciesResponse}})
async def upload_image(
    request: Request,
    filename: str = Query(min_length=1),
    name: str = Query(min_length=1),
    distribution: str = Query("custom"),
    version: str = Query("custom"),
    firmware: Literal["bios", "efi"] = Query("bios"),
):
    upload = ImageUpload(name=name, distribution=distribution,
                         version=version, firmware=firmware)
    return await ImageService.upload_image(
        request.stream(), filename, upload)
