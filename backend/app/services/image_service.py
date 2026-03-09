import subprocess
import json
import yaml
from app.models.image import ImageRead
from pathlib import Path
from app.core.config import s3, distribox_bucket_registry


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
            print(f"No image found")
            return None
        except Exception as e:
            print(f"Error")
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
                    except Exception as e:
                        print(f"Error on {key}: {e}")
        return images
