import logging
import subprocess
import json
import yaml
from app.models.image import ImageRead
from pathlib import Path
from app.core.config import s3, distribox_bucket_registry

logger = logging.getLogger(__name__)


class ImageService():

    @staticmethod
    def get_distribox_image(image_name):
        try:
            response = s3.get_object(
                Bucket=distribox_bucket_registry, Key=image_name)
            content = response["Body"].read().decode("utf-8")
            data = yaml.safe_load(content)
            return ImageRead(**data)
        except s3.exceptions.NoSuchKey:
            logger.warning("No image found: %s", image_name)
            return None
        except Exception:
            logger.exception("Error fetching image: %s", image_name)
            return None

    @staticmethod
    def get_distribox_image_list():
        images = []
        paginator = s3.get_paginator("list_objects_v2")

        for page in paginator.paginate(Bucket=distribox_bucket_registry):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith((".yaml", ".yml")):
                    response = s3.get_object(
                        Bucket=distribox_bucket_registry, Key=key)
                    content = response["Body"].read().decode("utf-8")
                    data = yaml.safe_load(content)
                    try:
                        image = ImageRead(**data)
                        images.append(image)
                    except Exception:
                        logger.warning("Failed to parse image %s", key)
        return images
