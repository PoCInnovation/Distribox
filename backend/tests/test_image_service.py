import asyncio
import io
import json
import shutil
import subprocess
import uuid
import zipfile

import pytest
import yaml
from fastapi import HTTPException

from app.core import xml_builder
from app.models.image import ImageRead, ImageUpload
from app.models.vm import VmCreateXML
from app.services import image_service
from app.services.image_service import ImageService


def write_image(images_dir, slug, **fields):
    metadata = {
        "name": slug,
        "image": f"{slug}.qcow2",
        "version": "1",
        "distribution": "custom",
        "family": "local",
        "revision": 0,
        **fields,
    }
    (images_dir / f"{slug}.metadata.yaml").write_text(yaml.safe_dump(metadata))
    (images_dir / f"{slug}.qcow2").write_bytes(b"")
    return metadata


async def single_chunk(data):
    yield data


async def upload(name, filename, data, chunk_size=1000, **fields):
    for offset in range(0, len(data), chunk_size):
        await ImageService.write_chunk(
            name, filename, offset,
            single_chunk(data[offset:offset + chunk_size]))
    image = await ImageService.finish_upload(
        filename, ImageUpload(name=name, **fields))
    while (result := ImageService.upload_status(name))["status"] == "converting":
        await asyncio.sleep(0.05)
    return image, result


def test_local_images_are_listed_after_registry_ones(tmp_path, monkeypatch):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    write_image(tmp_path, "course-vm", firmware="efi")
    write_image(tmp_path, "orphan")
    (tmp_path / "orphan.qcow2").unlink()
    registry = ImageRead(name="Debian 12", image="distribox-debian-12.qcow2",
                         version="12", distribution="debian",
                         family="debian", revision=1)
    monkeypatch.setattr(ImageService, "get_registry_image_list",
                        lambda: [registry])

    images = ImageService.get_distribox_image_list()

    assert [image.image for image in images] == [
        "distribox-debian-12.qcow2", "course-vm.qcow2"]
    assert images[0].firmware == "bios"
    assert images[1].firmware == "efi"


def test_registry_errors_do_not_hide_local_images(tmp_path, monkeypatch):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    write_image(tmp_path, "course-vm")

    class OfflineS3:
        def get_paginator(self, name):
            raise RuntimeError("offline")

    monkeypatch.setattr(image_service, "s3", OfflineS3())

    images = ImageService.get_distribox_image_list()

    assert [image.image for image in images] == ["course-vm.qcow2"]


def test_upload_rejects_existing_image(tmp_path, monkeypatch):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    write_image(tmp_path, "course-vm")

    with pytest.raises(HTTPException) as error:
        asyncio.run(ImageService.write_chunk(
            "Course VM", "disk.qcow2", 0, single_chunk(b"data")))

    assert error.value.status_code == 409


def test_upload_rejects_unknown_file_type(tmp_path, monkeypatch):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)

    with pytest.raises(HTTPException) as error:
        asyncio.run(ImageService.write_chunk(
            "Course VM", "disk.iso", 0, single_chunk(b"data")))

    assert error.value.status_code == 400
    assert list(tmp_path.iterdir()) == []


def test_upload_rejects_out_of_sync_chunks(tmp_path, monkeypatch):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)

    async def run():
        await ImageService.write_chunk(
            "Course VM", "disk.img", 0, single_chunk(b"abc"))
        await ImageService.write_chunk(
            "Course VM", "disk.img", 1, single_chunk(b"bc"))

    with pytest.raises(HTTPException) as error:
        asyncio.run(run())

    assert error.value.status_code == 409


def test_finish_without_data_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)

    with pytest.raises(HTTPException) as error:
        asyncio.run(ImageService.finish_upload(
            "disk.img", ImageUpload(name="Course VM")))

    assert error.value.status_code == 400


def test_failed_conversion_is_reported(tmp_path, monkeypatch):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("vm/README.md", "hello")

    image, result = asyncio.run(
        upload("Course VM", "vm.zip", archive.getvalue()))

    assert image.image == "course-vm.qcow2"
    assert result == {"status": "failed",
                      "detail": "No disk image found in the archive"}
    assert list(tmp_path.iterdir()) == []
    with pytest.raises(HTTPException):
        ImageService.upload_status("Course VM")


@pytest.mark.skipif(shutil.which("qemu-img") is None, reason="needs qemu-img")
def test_upload_extracts_and_converts_zipped_vmdk(tmp_path, monkeypatch):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    source = tmp_path / "source.vmdk"
    subprocess.run(["qemu-img", "create", "-f", "vmdk", str(source), "1M"],
                   check=True, capture_output=True)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("vm/README.md", "hello")
        zip_file.write(source, "vm/ArchLinux.vmdk")
    source.unlink()

    image, result = asyncio.run(upload(
        "Course VM", "vm.zip", archive.getvalue(),
        distribution="archlinux", firmware="efi"))

    info = json.loads(subprocess.run(
        ["qemu-img", "info", "--output=json", str(tmp_path / image.image)],
        check=True, capture_output=True, text=True).stdout)
    assert result == {"status": "ready", "detail": None}
    assert image.image == "course-vm.qcow2"
    assert info["format"] == "qcow2"
    assert sorted(path.name for path in tmp_path.iterdir()) == [
        "course-vm.metadata.yaml", "course-vm.qcow2"]
    assert ImageService.get_local_image("course-vm.metadata.yaml") == image
    assert image.family == "local"
    assert image.firmware == "efi"


def test_xml_enables_uefi_for_efi_images(tmp_path, monkeypatch):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    write_image(tmp_path, "course-vm", firmware="efi")
    write_image(tmp_path, "legacy-vm")

    def build(image):
        return xml_builder.build_xml(VmCreateXML(
            id=uuid.uuid4(), os=image, name="vm", mem=2, vcpus=2,
            disk_size=10))

    efi_xml = build("course-vm.qcow2")
    assert '<os firmware="efi">' in efi_xml
    assert '<feature enabled="no" name="secure-boot"/>' in efi_xml
    assert "firmware" not in build("legacy-vm.qcow2")
    assert "firmware" not in build("missing.qcow2")
