import asyncio
import io
import json
import shutil
import subprocess
import uuid
import zipfile
from unittest.mock import Mock

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
    return image, await finished(name)


async def finished(name):
    while (result := ImageService.upload_status(name))["status"] in (
            "converting", "preparing"):
        await asyncio.sleep(0.05)
    return result


@pytest.fixture(autouse=True)
def ssh_preparation(monkeypatch):
    """Stands in for libguestfs; set `reason` for an image it cannot prepare."""
    preparation = Mock(return_value=None)
    monkeypatch.setattr(image_service, "prepare_for_ssh", preparation)
    return preparation


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

    client = Mock()
    client.get_object.return_value = {"Body": io.BytesIO(b"bad header")}
    monkeypatch.setattr(image_service, "s3", client)

    images = ImageService.get_distribox_image_list()

    assert images[0].min_disk_size is None
    assert [image.image for image in images] == [
        "distribox-debian-12.qcow2", "course-vm.qcow2"]
    assert images[0].firmware == "bios"
    assert images[1].firmware == "efi"


def test_catalog_reports_virtual_disk_minimum_for_local_and_registry_images(
        tmp_path, monkeypatch):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    write_image(tmp_path, "local")
    registry = ImageRead(**write_image(tmp_path, "registry"))
    (tmp_path / registry.image).unlink()
    monkeypatch.setattr(ImageService, "get_registry_image_list",
                        lambda: [registry])
    # The local disk's virtual size is one sector over 24 GiB.
    run = Mock(return_value=subprocess.CompletedProcess(
        [], 0, json.dumps({"virtual-size": 24 * 2**30 + 512})))
    monkeypatch.setattr(subprocess, "run", run)
    # Only the first 32 bytes of the uncached qcow2 are needed.
    header = b"QFI\xfb" + (3).to_bytes(4, "big") + bytes(16)
    body = io.BytesIO(header + (9 * 2**30).to_bytes(8, "big"))
    registry_client = Mock()
    registry_client.get_object.return_value = {"Body": body}
    monkeypatch.setattr(image_service, "s3", registry_client)

    images = ImageService.get_distribox_image_list()

    assert {i.image: i.min_disk_size for i in images} == {
        "local.qcow2": 25, "registry.qcow2": 9}
    registry_client.get_object.assert_called_once_with(
        Bucket=image_service.distribox_bucket_registry, Key="registry.qcow2",
        Range="bytes=0-31")
    assert body.closed


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
    assert image.ssh_ready is True


def test_upload_says_why_ssh_could_not_be_set_up(tmp_path, monkeypatch, ssh_preparation):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    monkeypatch.setattr(ImageService, "_convert_image",
                        lambda source, target: source.rename(target))
    ssh_preparation.return_value = "No Linux system was found on the disk"

    image, result = asyncio.run(upload("Course VM", "disk.qcow2", b"disk"))

    assert result == {"status": "ready",
                      "detail": "No Linux system was found on the disk"}
    ssh_preparation.assert_called_once_with(
        tmp_path / "course-vm.qcow2", replace=False)
    stored = ImageService.get_local_image("course-vm.metadata.yaml")
    assert stored.ssh_ready is False
    assert stored.ssh_detail == "No Linux system was found on the disk"


def test_upload_fails_when_the_prepared_image_cannot_be_saved(tmp_path, monkeypatch, ssh_preparation):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    monkeypatch.setattr(ImageService, "_convert_image",
                        lambda source, target: source.rename(target))
    ssh_preparation.side_effect = RuntimeError("Could not save the prepared image")

    image, result = asyncio.run(upload("Course VM", "disk.qcow2", b"disk"))

    assert result == {"status": "failed",
                      "detail": "Could not save the prepared image"}
    assert list(tmp_path.iterdir()) == []


def test_image_uploaded_earlier_can_be_prepared(tmp_path, monkeypatch, ssh_preparation):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    write_image(tmp_path, "course-vm", family="local", firmware="efi")
    seen = []
    ssh_preparation.side_effect = lambda path, replace: seen.append(
        ImageService.upload_status("course-vm")["status"])

    async def run():
        await ImageService.prepare_image("course-vm.qcow2")
        with pytest.raises(HTTPException) as error:
            await ImageService.prepare_image("course-vm.qcow2")
        assert error.value.status_code == 409
        return await finished("course-vm")

    assert asyncio.run(run()) == {"status": "ready", "detail": None}
    assert seen == ["preparing"]
    # VMs may be created from it meanwhile, so it must be replaced, not changed.
    ssh_preparation.assert_called_once_with(
        tmp_path / "course-vm.qcow2", replace=True)
    stored = ImageService.get_local_image("course-vm.metadata.yaml")
    assert stored.ssh_ready is True
    assert stored.firmware == "efi"


def test_second_upload_of_an_image_still_being_processed_is_rejected(tmp_path, monkeypatch, ssh_preparation):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    monkeypatch.setattr(ImageService, "_convert_image",
                        lambda source, target: source.rename(target))
    refused = []

    def upload_again(path, replace):
        for attempt in (
            ImageService.write_chunk("Course VM", "disk.qcow2", 0, single_chunk(b"other")),
            ImageService.finish_upload("disk.qcow2", ImageUpload(name="Course VM")),
        ):
            with pytest.raises(HTTPException) as error:
                asyncio.run(attempt)
            refused.append(error.value.status_code)

    ssh_preparation.side_effect = upload_again

    image, result = asyncio.run(upload("Course VM", "disk.qcow2", b"disk"))

    assert result == {"status": "ready", "detail": None}
    assert refused == [409, 409]
    assert (tmp_path / "course-vm.qcow2").read_bytes() == b"disk"


def test_upload_finished_after_its_name_was_taken_is_rejected(tmp_path, monkeypatch, ssh_preparation):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    # Two uploads of one name started together, and the other one finished.
    write_image(tmp_path, "course-vm", family="local")
    (tmp_path / "course-vm.qcow2").write_bytes(b"published")
    (tmp_path / "course-vm.upload.vmdk").write_bytes(b"late")

    with pytest.raises(HTTPException) as error:
        asyncio.run(ImageService.finish_upload(
            "disk.vmdk", ImageUpload(name="Course VM")))

    assert error.value.status_code == 409
    assert (tmp_path / "course-vm.qcow2").read_bytes() == b"published"
    assert sorted(path.name for path in tmp_path.iterdir()) == [
        "course-vm.metadata.yaml", "course-vm.qcow2"]
    ssh_preparation.assert_not_called()


@pytest.mark.parametrize("name", [
    "distribox-debian-12.qcow2", "missing.qcow2", "../course-vm.qcow2"])
def test_only_uploaded_images_can_be_prepared(tmp_path, monkeypatch, ssh_preparation, name):
    monkeypatch.setattr(image_service, "IMAGES_DIR", tmp_path)
    write_image(tmp_path, "course-vm", family="local")
    write_image(tmp_path, "distribox-debian-12", family="debian")

    with pytest.raises(HTTPException) as error:
        asyncio.run(ImageService.prepare_image(name))

    assert error.value.status_code == 404
    ssh_preparation.assert_not_called()


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
