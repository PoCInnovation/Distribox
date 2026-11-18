from contextlib import closing
from functools import lru_cache
import asyncio
import json
import logging
import re
import shutil
import subprocess
import zipfile
from pathlib import Path
import yaml
from fastapi import HTTPException, status
from app.models.image import CatalogImage, ImageRead, ImageUpload
from app.core.constants import IMAGES_DIR
from app.core.config import s3, distribox_bucket_registry
from app.services.image_preparation import prepare_for_ssh

logger = logging.getLogger(__name__)

DISK_SUFFIXES = (".qcow2", ".vmdk", ".vdi", ".img", ".raw")
conversions: dict[str, asyncio.Task] = {}
# The images whose conversion is over and that are being prepared for SSH.
preparing: set[str] = set()


def _disk_gib(size_bytes: int) -> int:
    return (size_bytes + 2**30 - 1) // 2**30


@lru_cache(maxsize=256)
def _registry_min_disk_size(image: str, revision: int) -> int:
    # A registry revision identifies the bytes published under this filename.
    response = s3.get_object(Bucket=distribox_bucket_registry, Key=image,
                             Range="bytes=0-31")
    with closing(response["Body"]) as body:
        header = body.read(32)
    if (len(header) != 32 or header[:4] != b"QFI\xfb" or
            int.from_bytes(header[4:8], "big") not in (2, 3)):
        raise ValueError("Invalid qcow2 header")
    return _disk_gib(int.from_bytes(header[24:32], "big"))


class ImageService():

    @staticmethod
    def _parse_image(content: str, source: str):
        try:
            return ImageRead(**yaml.safe_load(content))
        except Exception:
            logger.warning("Failed to parse image %s", source)
            return None

    @staticmethod
    def get_local_image(metadata_filename: str):
        metadata_path = IMAGES_DIR / metadata_filename
        if not metadata_path.exists():
            return None
        return ImageService._parse_image(
            metadata_path.read_text(encoding="utf-8"), metadata_filename)

    @staticmethod
    def get_registry_image(metadata_filename: str):
        try:
            response = s3.get_object(
                Bucket=distribox_bucket_registry, Key=metadata_filename)
            content = response["Body"].read().decode("utf-8")
            return ImageService._parse_image(content, metadata_filename)
        except s3.exceptions.NoSuchKey:
            return None
        except Exception:
            logger.exception("Error fetching image: %s", metadata_filename)
            return None

    @staticmethod
    def get_distribox_image(metadata_filename: str):
        image = ImageService.get_registry_image(metadata_filename)
        if image is None:
            image = ImageService.get_local_image(metadata_filename)
        return image

    @staticmethod
    def get_local_image_list():
        images = []
        for metadata_path in sorted(IMAGES_DIR.glob("*.metadata.yaml")):
            image = ImageService.get_local_image(metadata_path.name)
            if image and (IMAGES_DIR / image.image).exists():
                images.append(image)
        return images

    @staticmethod
    def get_registry_image_list():
        images = []
        try:
            paginator = s3.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=distribox_bucket_registry):
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    if not key.endswith((".yaml", ".yml")):
                        continue
                    response = s3.get_object(
                        Bucket=distribox_bucket_registry, Key=key)
                    content = response["Body"].read().decode("utf-8")
                    image = ImageService._parse_image(content, key)
                    if image:
                        images.append(image)
        except Exception:
            logger.exception("Failed to list registry images")
        return images

    @staticmethod
    def get_distribox_image_list():
        images = {
            image.image: image
            for image in ImageService.get_registry_image_list()
        }
        for image in ImageService.get_local_image_list():
            images.setdefault(image.image, image)
        catalog = []
        for image in images.values():
            minimum = None
            try:
                image_path = (IMAGES_DIR / image.image).resolve()
                if not image_path.is_relative_to(IMAGES_DIR.resolve()):
                    raise ValueError("Invalid image path")
                if image_path.is_file():
                    minimum = ImageService.local_min_disk_size(image_path)
                else:
                    minimum = _registry_min_disk_size(
                        image.image, image.revision)
            except Exception as error:
                logger.warning("Cannot read disk size for %s: %s",
                               image.image, error)
            catalog.append(CatalogImage(**image.model_dump(),
                                        min_disk_size=minimum))
        return catalog

    @staticmethod
    def local_min_disk_size(image_path: Path) -> int:
        result = subprocess.run(
            ["qemu-img", "info", "--output=json", str(image_path)],
            capture_output=True, text=True, check=True,
        )
        return _disk_gib(json.loads(result.stdout)["virtual-size"])

    @staticmethod
    def _slug(name: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        if not slug:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Invalid image name")
        return slug

    @staticmethod
    def _upload_path(slug: str, filename: str) -> Path:
        suffix = Path(filename).suffix.lower()
        if suffix not in DISK_SUFFIXES + (".zip",):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported image file '{filename}'",
            )
        return IMAGES_DIR / f"{slug}.upload{suffix}"

    @staticmethod
    async def write_chunk(name: str, filename: str, offset: int, stream):
        slug = ImageService._slug(name)
        upload_path = ImageService._upload_path(slug, filename)
        if offset == 0:
            ImageService._require_idle(slug)
            if (IMAGES_DIR / f"{slug}.metadata.yaml").exists():
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"An image named '{slug}' already exists",
                )
            upload_path.unlink(missing_ok=True)
        elif not upload_path.exists() or upload_path.stat().st_size != offset:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Upload out of sync, please start again",
            )
        with upload_path.open("ab") as upload_file:
            async for chunk in stream:
                upload_file.write(chunk)

    @staticmethod
    async def finish_upload(filename: str, upload: ImageUpload):
        slug = ImageService._slug(upload.name)
        ImageService._require_idle(slug)
        upload_path = ImageService._upload_path(slug, filename)
        if (IMAGES_DIR / f"{slug}.metadata.yaml").exists():
            # Another upload took the name while this one was being sent.
            upload_path.unlink(missing_ok=True)
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"An image named '{slug}' already exists",
            )
        if not upload_path.exists():
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "No uploaded data for this image",
            )
        image = ImageRead(
            name=upload.name,
            image=f"{slug}.qcow2",
            version=upload.version,
            distribution=upload.distribution,
            family="local",
            revision=0,
            firmware=upload.firmware,
        )
        conversions[slug] = asyncio.create_task(
            ImageService._convert_upload(upload_path, image))
        return image

    @staticmethod
    async def _convert_upload(upload_path: Path, image: ImageRead):
        image_path = IMAGES_DIR / image.image
        try:
            await asyncio.to_thread(
                ImageService._convert_image, upload_path, image_path)
            return await ImageService._prepare(image)
        except Exception:
            image_path.unlink(missing_ok=True)
            raise
        finally:
            upload_path.unlink(missing_ok=True)

    @staticmethod
    def _require_idle(slug: str):
        """Two jobs on one image would overwrite each other's files."""
        if slug in conversions and not conversions[slug].done():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"The image '{slug}' is still being processed",
            )

    @staticmethod
    async def _prepare(image: ImageRead, replace: bool = False):
        """Prepare an image for SSH and record how that went in its metadata."""
        slug = Path(image.image).stem
        preparing.add(slug)
        try:
            image.ssh_detail = await asyncio.to_thread(
                prepare_for_ssh, IMAGES_DIR / image.image, replace=replace)
        finally:
            preparing.discard(slug)
        image.ssh_ready = image.ssh_detail is None
        (IMAGES_DIR / f"{slug}.metadata.yaml").write_text(
            yaml.safe_dump(image.model_dump(), sort_keys=False))
        return image.ssh_detail

    @staticmethod
    async def prepare_image(image_name: str):
        """Prepare an image that was uploaded before, or again after a failure."""
        image = next((image for image in ImageService.get_local_image_list()
                      if image.image == image_name and image.family == "local"),
                     None)
        if image is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                f"No uploaded image named '{image_name}'",
            )
        slug = Path(image.image).stem
        ImageService._require_idle(slug)
        # VMs can be created from this image meanwhile: it is replaced, not
        # changed.
        conversions[slug] = asyncio.create_task(
            ImageService._prepare(image, replace=True))
        return image

    @staticmethod
    def upload_status(name: str) -> dict:
        slug = ImageService._slug(name)
        task = conversions.get(slug)
        if task is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "No upload in progress")
        if not task.done():
            return {"status": "preparing" if slug in preparing else "converting",
                    "detail": None}
        del conversions[slug]
        error = task.exception()
        if error is None:
            # A ready image comes with the reason SSH could not be set up, if any.
            return {"status": "ready", "detail": task.result()}
        detail = error.detail if isinstance(
            error, HTTPException) else str(error)
        return {"status": "failed", "detail": detail}

    @staticmethod
    def _convert_image(source: Path, target: Path):
        if source.suffix == ".zip":
            source = ImageService._extract_disk(source)
        try:
            image_format = ImageService._image_format(source)
            if image_format == "qcow2":
                source.rename(target)
                return
            result = subprocess.run(
                ["qemu-img", "convert", "-f", image_format, "-O", "qcow2",
                 str(source), str(target)],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"Image conversion failed: {result.stderr.strip()}",
                )
        finally:
            source.unlink(missing_ok=True)

    @staticmethod
    def _image_format(source: Path) -> str:
        result = subprocess.run(
            ["qemu-img", "info", "--output=json", str(source)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unreadable disk image: {result.stderr.strip()}",
            )
        return json.loads(result.stdout)["format"]

    @staticmethod
    def _is_disk_member(member: zipfile.ZipInfo) -> bool:
        if member.is_dir() or Path(member.filename).name.startswith("._"):
            return False
        return member.filename.lower().endswith(DISK_SUFFIXES)

    @staticmethod
    def _extract_disk(archive: Path) -> Path:
        with zipfile.ZipFile(archive) as zip_file:
            members = [
                member for member in zip_file.infolist()
                if ImageService._is_disk_member(member)
            ]
            if not members:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "No disk image found in the archive",
                )
            member = max(members, key=lambda member: member.file_size)
            target = archive.with_suffix(Path(member.filename).suffix.lower())
            with zip_file.open(member) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
        archive.unlink()
        return target
