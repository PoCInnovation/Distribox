import io
import json
import os
import shutil
import subprocess
import threading
from pathlib import Path
from unittest.mock import Mock

import pytest
import yaml
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

from app.models.image import ImageRead
from app.models.vm import VmCreate
from app.services import image_service, operation_service, vm_service
from app.services.image_service import ImageService
from app.services.vm_service import Vm, VmService


class NoSuchKeyError(Exception):
    pass


def qcow2_bytes(label: bytes, *, gib: int = 9) -> bytes:
    return (
        b"QFI\xfb" + (3).to_bytes(4, "big") + bytes(16) +
        (gib * 2**30).to_bytes(8, "big") + label
    )


def metadata_bytes(slug: str, *, revision: int = 1, family: str = "debian",
                   firmware: str = "bios") -> bytes:
    return yaml.safe_dump({
        "name": slug,
        "image": f"{slug}.qcow2",
        "version": "12",
        "distribution": "debian",
        "family": family,
        "revision": revision,
        "firmware": firmware,
    }, sort_keys=False).encode("utf-8")


def write_local_image(images_dir: Path, slug: str, disk: bytes | None,
                      *, revision: int = 1, family: str = "debian",
                      firmware: str = "bios") -> None:
    (images_dir / f"{slug}.metadata.yaml").write_bytes(
        metadata_bytes(slug, revision=revision, family=family,
                       firmware=firmware)
    )
    if disk is not None:
        (images_dir / f"{slug}.qcow2").write_bytes(disk)


class FakeS3:
    def __init__(self, objects: dict[str, bytes]):
        self.objects = dict(objects)
        self.exceptions = type("Exceptions", (), {"NoSuchKey": NoSuchKeyError})
        self.get_calls: list[str] = []
        self.download_calls: list[str] = []
        self.fail_gets: dict[str, Exception] = {}
        self.fail_downloads: dict[str, tuple[bytes | None, Exception]] = {}
        self.on_download = None

    def get_object(self, Bucket, Key, Range=None):
        self.get_calls.append(Key)
        if Key in self.fail_gets:
            raise self.fail_gets[Key]
        if Key not in self.objects:
            raise NoSuchKeyError(Key)
        data = self.objects[Key]
        if Range is not None:
            start, end = (int(p)
                          for p in Range.removeprefix("bytes=").split("-"))
            data = data[start:end + 1]
        return {"Body": io.BytesIO(data)}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise NoSuchKeyError(Key)
        return {"ContentLength": len(self.objects[Key])}

    def download_file(self, bucket, key, path, Callback=None):
        target = Path(path)
        self.download_calls.append(key)
        if self.on_download is not None:
            self.on_download(key, target)
        if key in self.fail_downloads:
            partial, error = self.fail_downloads[key]
            if partial is not None:
                target.write_bytes(partial)
            raise error
        if key not in self.objects:
            raise NoSuchKeyError(key)
        data = self.objects[key]
        target.write_bytes(data)
        if Callback is not None:
            Callback(len(data))


def fake_qemu_img(args, **kwargs):
    if args[1] == "info":
        header = Path(args[-1]).read_bytes()[:32]
        if (len(header) != 32 or header[:4] != b"QFI\xfb" or
                int.from_bytes(header[4:8], "big") not in (2, 3)):
            return subprocess.CompletedProcess(
                args, 1, "", "qemu-img: Image is not in qcow2 format")
        size = int.from_bytes(header[24:32], "big")
        return subprocess.CompletedProcess(
            args, 0, json.dumps({"format": "qcow2", "virtual-size": size}), "")
    return subprocess.CompletedProcess(
        args, 0, json.dumps({"corruptions": 0, "check-errors": 0}), "")


@pytest.fixture
def cache_env(tmp_path, monkeypatch):
    images_dir = tmp_path / "images"
    images_dir.mkdir()
    monkeypatch.setattr(vm_service, "IMAGES_DIR", images_dir)
    monkeypatch.setattr(image_service, "IMAGES_DIR", images_dir)
    monkeypatch.setattr(vm_service.subprocess, "run", fake_qemu_img)
    image_service._registry_min_disk_size.cache_clear()
    yield images_dir
    image_service._registry_min_disk_size.cache_clear()


@pytest.fixture
def vm_env(cache_env, tmp_path, monkeypatch):
    vms_dir = tmp_path / "vms"
    vms_dir.mkdir()
    monkeypatch.setattr(vm_service, "VMS_DIR", vms_dir)
    monkeypatch.setattr(vm_service, "ensure_seed_iso", Mock())
    monkeypatch.setattr(vm_service, "QEMUConfig", Mock())
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(vm_service, "engine", engine)
    monkeypatch.setattr(operation_service, "engine", engine)
    monkeypatch.setattr(operation_service, "_alive", set())
    yield cache_env, vms_dir
    engine.dispose()


def attach_s3(monkeypatch, objects: dict[str, bytes]) -> FakeS3:
    fake = FakeS3(objects)
    monkeypatch.setattr(vm_service, "s3", fake)
    monkeypatch.setattr(image_service, "s3", fake)
    return fake


def test_changed_revision_refreshes_disk_and_metadata_then_reuses_cache(
        cache_env, monkeypatch):
    disk_v1 = qcow2_bytes(b"disk-v1")
    disk_v2 = qcow2_bytes(b"disk-v2")
    write_local_image(cache_env, "debian", disk_v1,
                      revision=1, firmware="bios")
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": disk_v2,
    })

    image_path = Vm._download_image("debian.qcow2")

    assert image_path.read_bytes() == disk_v2
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None and local.revision == 2 and local.firmware == "efi"
    assert fake.download_calls == ["debian.metadata.yaml", "debian.qcow2"]
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]

    # Unchanged revision (or offline registry) reuses the cached files.
    fake.download_calls.clear()
    assert Vm._download_image("debian.qcow2") == image_path
    assert fake.download_calls == []

    fake.fail_gets["debian.metadata.yaml"] = RuntimeError("registry offline")
    assert Vm._download_image("debian.qcow2").read_bytes() == disk_v2
    assert fake.download_calls == []


def test_missing_disk_downloads_disk_and_metadata(cache_env, monkeypatch):
    disk_v2 = qcow2_bytes(b"disk-v2")
    write_local_image(cache_env, "debian", None, revision=1, firmware="bios")
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": disk_v2,
    })

    image_path = Vm._download_image("debian.qcow2")

    assert image_path.read_bytes() == disk_v2
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None and local.revision == 2 and local.firmware == "efi"
    assert fake.download_calls == ["debian.metadata.yaml", "debian.qcow2"]


@pytest.mark.parametrize("failure_mode, expected_error", [
    ("disk_error", RuntimeError),
    ("metadata_error", RuntimeError),
    ("corrupt_disk", ValueError),
])
def test_failed_refresh_preserves_previous_cache_and_allows_retry(
        cache_env, monkeypatch, failure_mode, expected_error):
    disk_v1 = qcow2_bytes(b"disk-v1")
    disk_v2 = qcow2_bytes(b"disk-v2")
    write_local_image(cache_env, "debian", disk_v1,
                      revision=1, firmware="bios")
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": (
            b"<html>502</html>" if failure_mode == "corrupt_disk" else disk_v2
        ),
    })
    if failure_mode == "disk_error":
        fake.fail_downloads["debian.qcow2"] = (
            b"partial", RuntimeError("network drop"))
    elif failure_mode == "metadata_error":
        fake.fail_downloads["debian.metadata.yaml"] = (
            b"partial", RuntimeError("s3 timeout"))

    with pytest.raises(expected_error):
        Vm._download_image("debian.qcow2")

    assert (cache_env / "debian.qcow2").read_bytes() == disk_v1
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None and local.revision == 1 and local.firmware == "bios"
    assert Vm.has_revision_changed("debian.metadata.yaml") is True
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]

    if failure_mode == "disk_error":
        fake.fail_downloads.clear()
        assert Vm._download_image("debian.qcow2").read_bytes() == disk_v2


@pytest.mark.skipif(shutil.which("qemu-img") is None, reason="needs qemu-img")
def test_real_qemu_img_rejects_malformed_qcow2_and_accepts_valid_qcow2(
        tmp_path, monkeypatch):
    images_dir = tmp_path / "images"
    images_dir.mkdir()
    monkeypatch.setattr(vm_service, "IMAGES_DIR", images_dir)
    monkeypatch.setattr(image_service, "IMAGES_DIR", images_dir)

    real_v1, real_v2, raw_v2 = (
        tmp_path / "v1.qcow2", tmp_path / "v2.qcow2", tmp_path / "v2.raw")
    subprocess.run(["qemu-img", "create", "-f", "qcow2", str(real_v1), "1M"],
                   check=True, capture_output=True)
    raw_v2.write_bytes(b"A" * 131072)
    subprocess.run(["qemu-img", "convert", "-f", "raw", "-O", "qcow2",
                    str(raw_v2), str(real_v2)],
                   check=True, capture_output=True)
    v1_bytes, v2_bytes = real_v1.read_bytes(), real_v2.read_bytes()

    write_local_image(images_dir, "debian", v1_bytes, revision=1)
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes("debian", revision=2),
        "debian.qcow2": v2_bytes[:-65536],
    })

    with pytest.raises(ValueError, match="Corrupted disk image"):
        Vm._download_image("debian.qcow2")
    assert (images_dir / "debian.qcow2").read_bytes() == v1_bytes

    fake.objects["debian.qcow2"] = v2_bytes
    Vm._download_image("debian.qcow2")
    assert (images_dir / "debian.qcow2").read_bytes() == v2_bytes


def test_commit_failure_rolls_back_and_recovers_interrupted_swap(
        cache_env, monkeypatch):
    disk_v1 = qcow2_bytes(b"disk-v1")
    disk_v2 = qcow2_bytes(b"disk-v2")
    write_local_image(cache_env, "debian", disk_v1,
                      revision=1, firmware="bios")
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": disk_v2,
    })
    real_replace = os.replace

    def fail_metadata_replace(src, dst):
        if Path(dst) == cache_env / "debian.metadata.yaml":
            raise OSError("metadata rename failed")
        return real_replace(src, dst)

    monkeypatch.setattr(vm_service.os, "replace", fail_metadata_replace)
    with pytest.raises(OSError, match="metadata rename failed"):
        Vm._download_image("debian.qcow2")
    assert (cache_env / "debian.qcow2").read_bytes() == disk_v1

    # Recover cleanly from a crash between disk swap and metadata swap.
    monkeypatch.setattr(vm_service.os, "replace", real_replace)
    (cache_env / ".debian.qcow2.rollback.tmp").write_bytes(disk_v1)
    (cache_env / "debian.qcow2").write_bytes(disk_v2)
    (cache_env / ".debian.metadata.yaml.commit.tmp").write_bytes(
        metadata_bytes("debian", revision=2, firmware="efi"))
    fake.fail_gets["debian.metadata.yaml"] = RuntimeError("registry offline")

    assert Vm._download_image("debian.qcow2").read_bytes() == disk_v1
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]


def test_local_only_imported_image_reuses_cache_and_missing_disk_returns_404(
        cache_env, monkeypatch):
    imported_disk = qcow2_bytes(b"imported-disk", gib=15)
    write_local_image(cache_env, "course-vm", imported_disk,
                      revision=0, family="local", firmware="efi")
    collision = ImageRead(
        name="Registry Course VM", image="course-vm.qcow2", version="99",
        distribution="debian", family="debian", revision=4, firmware="bios",
    )
    monkeypatch.setattr(ImageService, "get_registry_image_list",
                        lambda: [collision])
    fake = attach_s3(monkeypatch, {
        "course-vm.metadata.yaml": metadata_bytes(
            "course-vm", revision=4, family="debian", firmware="bios"),
        "course-vm.qcow2": qcow2_bytes(b"registry-disk", gib=30),
    })

    assert Vm.has_revision_changed("course-vm.metadata.yaml") is False
    assert Vm._download_image("course-vm.qcow2").read_bytes() == imported_disk
    [entry] = ImageService.get_distribox_image_list()
    assert entry.family == "local" and entry.min_disk_size == 15
    assert fake.get_calls == [] and fake.download_calls == []

    (cache_env / "course-vm.qcow2").unlink()
    with pytest.raises(HTTPException) as error:
        Vm._download_image("course-vm.qcow2")
    assert error.value.status_code == 404
    assert fake.download_calls == []


def test_vm_creation_uses_refreshed_disk_and_firmware(vm_env, monkeypatch):
    cache_env, vms_dir = vm_env
    slug = "my-qcow2-vm"
    write_local_image(cache_env, slug, qcow2_bytes(b"rev-1", gib=30),
                      revision=1, firmware="bios")
    small_v2 = qcow2_bytes(b"rev-2", gib=10)
    attach_s3(monkeypatch, {
        f"{slug}.metadata.yaml": metadata_bytes(
            slug, revision=2, firmware="efi"),
        f"{slug}.qcow2": small_v2,
    })

    vm = VmService.create_vm(VmCreate(
        name="Refreshed VM", os=f"{slug}.qcow2", mem=2, vcpus=1,
        disk_size=10, activate_at_start=False,
    ))

    assert (vms_dir / str(vm.id) / f"{slug}.qcow2").read_bytes() == small_v2
    define_xml = vm_service.QEMUConfig.get_connection().defineXML
    assert '<os firmware="efi">' in define_xml.call_args.args[0]


def test_concurrent_revision_refreshes_download_once(cache_env, monkeypatch):
    disk_v2 = qcow2_bytes(b"disk-v2")
    write_local_image(cache_env, "debian", qcow2_bytes(b"disk-v1"), revision=1)
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes("debian", revision=2),
        "debian.qcow2": disk_v2,
    })
    downloading = threading.Event()
    release = threading.Event()

    def pause_first(key, _target):
        if key == "debian.qcow2" and not downloading.is_set():
            downloading.set()
            assert release.wait(5)

    fake.on_download = pause_first
    results: list[bytes] = []
    t1 = threading.Thread(
        target=lambda: results.append(
            Vm._download_image("debian.qcow2").read_bytes()))
    t2 = threading.Thread(
        target=lambda: results.append(
            Vm._download_image("debian.qcow2").read_bytes()))
    t1.start()
    assert downloading.wait(5)
    t2.start()
    release.set()
    t1.join(5)
    t2.join(5)

    assert results == [disk_v2, disk_v2]
    assert fake.download_calls == ["debian.metadata.yaml", "debian.qcow2"]
    assert vm_service._image_download_locks == {}
