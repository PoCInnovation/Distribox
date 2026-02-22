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
            if file.suffix != ".qcow2":
                continue
            image_info = subprocess.run(["qemu-img",
                                         "info",
                                         "--output=json",
                                         str(file)],
                                        capture_output=True,
                                        text=True,
                                        check=True)
            image_info_json = json.loads(image_info.stdout)
            if image_info_json.get("format") != "qcow2":
                continue
            image_list.append(ImageRead(
                name=image_info_json["filename"].split("/")[-1],
                virtual_size=round(
                    image_info_json["virtual-size"] / (1024 ** 3), 2),
                actual_size=round(
                    image_info_json["actual-size"] / (1024 ** 3), 2)
            ))
        return image_list
