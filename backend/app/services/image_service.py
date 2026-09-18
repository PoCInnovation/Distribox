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
from app.models.image import ImageRead, ImageUpload
from app.core.constants import IMAGES_DIR
from app.core.config import s3, distribox_bucket_registry

logger = logging.getLogger(__name__)

DISK_SUFFIXES = (".qcow2", ".vmdk", ".vdi", ".img", ".raw")


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
        return list(images.values())

    @staticmethod
    async def upload_image(stream, filename: str, upload: ImageUpload):
        suffix = Path(filename).suffix.lower()
        if suffix not in DISK_SUFFIXES + (".zip",):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported image file '{filename}'",
            )
        slug = re.sub(r"[^a-z0-9]+", "-", upload.name.lower()).strip("-")
        if not slug:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Invalid image name")
        image_path = IMAGES_DIR / f"{slug}.qcow2"
        metadata_path = IMAGES_DIR / f"{slug}.metadata.yaml"
        if image_path.exists() or metadata_path.exists():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"An image named '{slug}' already exists",
            )
        upload_path = IMAGES_DIR / f"{slug}.upload{suffix}"
        try:
            with upload_path.open("wb") as upload_file:
                async for chunk in stream:
                    upload_file.write(chunk)
            await asyncio.to_thread(
                ImageService._convert_image, upload_path, image_path)
        except Exception:
            image_path.unlink(missing_ok=True)
            raise
        finally:
            upload_path.unlink(missing_ok=True)
        image = ImageRead(
            name=upload.name,
            image=image_path.name,
            version=upload.version,
            distribution=upload.distribution,
            family="local",
            revision=0,
            firmware=upload.firmware,
        )
        metadata_path.write_text(
            yaml.safe_dump(image.model_dump(), sort_keys=False))
        return image

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
