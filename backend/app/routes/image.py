from typing import Literal
from fastapi import APIRouter, Depends, Query, Request, status
from app.services.image_service import ImageService
from app.models.image import ImageRead, ImageUpload, ImageUploadStatus
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


@router.put("/upload", status_code=status.HTTP_204_NO_CONTENT,
            dependencies=[Depends(require_policy("images:upload"))],
            responses={403: {"model": MissingPoliciesResponse}})
async def upload_image_chunk(
    request: Request,
    filename: str = Query(min_length=1),
    name: str = Query(min_length=1),
    offset: int = Query(ge=0),
):
    await ImageService.write_chunk(name, filename, offset, request.stream())


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED,
             response_model=ImageRead,
             dependencies=[Depends(require_policy("images:upload"))],
             responses={403: {"model": MissingPoliciesResponse}})
async def upload_image(
    filename: str = Query(min_length=1),
    name: str = Query(min_length=1),
    distribution: str = Query("custom"),
    version: str = Query("custom"),
    firmware: Literal["bios", "efi"] = Query("bios"),
):
    upload = ImageUpload(name=name, distribution=distribution,
                         version=version, firmware=firmware)
    return await ImageService.finish_upload(filename, upload)


@router.get("/upload/status", status_code=status.HTTP_200_OK,
            response_model=ImageUploadStatus,
            dependencies=[Depends(require_policy("images:upload"))],
            responses={403: {"model": MissingPoliciesResponse}})
def get_upload_status(name: str = Query(min_length=1)):
    return ImageService.upload_status(name)
