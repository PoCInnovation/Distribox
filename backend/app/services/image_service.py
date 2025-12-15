import subprocess
import json
from app.models.image import ImageRead
from pathlib import Path

class ImageService():
    @staticmethod
    def get_distribox_image_list():
        image_list = []
        images_folder = Path("/var/lib/distribox/images")
        for file in images_folder.iterdir():
            image_info = subprocess.run(
                ["qemu-img", "info", "--output=json", file]
                ,capture_output=True
                ,text=True
                ,check=True)
            image_info_json = json.loads(image_info.stdout)
            image_list.append(ImageRead(
                name=image_info_json["filename"].split("/")[-1],
                virtual_size=image_info_json["virtual-size"],
                actual_size=image_info_json["actual-size"]
            ))   
        return image_list
