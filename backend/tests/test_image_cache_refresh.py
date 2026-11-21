import io
import json
import os
import stat
import subprocess
import threading
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import Mock

import pytest
import yaml
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

from app.core import xml_builder
from app.models.vm import VmCreate, VmCreateXML
from app.services import image_service, operation_service, vm_service
from app.services.image_service import ImageService
from app.services.operation_service import Progress
from app.services.vm_service import Vm, VmService


class NoSuchKeyError(Exception):
    pass


class FakeS3:
    """In-memory S3 registry stub supporting object reads and failure injection."""

    def __init__(self, objects: dict[str, bytes]):
        self.objects = dict(objects)
        self.exceptions = type("Exceptions", (), {"NoSuchKey": NoSuchKeyError})
        self.get_calls: list[str] = []
        self.head_calls: list[str] = []
        self.download_calls: list[tuple[str, Path]] = []
        self.fail_gets: dict[str, Exception] = {}
        self.fail_downloads: dict[str, tuple[bytes | None, Exception]] = {}
        self.on_download = None

    def get_object(self, Bucket, Key):
        assert Bucket == vm_service.distribox_bucket_registry
        self.get_calls.append(Key)
        if Key in self.fail_gets:
            raise self.fail_gets[Key]
        if Key not in self.objects:
            raise NoSuchKeyError(Key)
        return {"Body": io.BytesIO(self.objects[Key])}

    def head_object(self, Bucket, Key):
        assert Bucket == vm_service.distribox_bucket_registry
        self.head_calls.append(Key)
        if Key not in self.objects:
            raise NoSuchKeyError(Key)
        return {"ContentLength": len(self.objects[Key])}

    def download_file(self, bucket, key, path, Callback=None):
        assert bucket == vm_service.distribox_bucket_registry
        target = Path(path)
        self.download_calls.append((key, target))
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


class Recorder(Progress):
    def __init__(self):
        self.calls = []

    def phase(self, phase, bytes_total=None):
        self.calls.append((phase, bytes_total))

    def advance(self, bytes_done):
        self.calls.append(bytes_done)


def metadata_bytes(slug: str, *, revision: int = 1, family: str = "debian",
                   firmware: str = "bios",
                   image_name: str | None = None) -> bytes:
    payload = {
        "name": slug,
        "image": image_name or f"{slug}.qcow2",
        "version": "12",
        "distribution": "debian",
        "family": family,
        "revision": revision,
        "firmware": firmware,
    }
    return yaml.safe_dump(payload, sort_keys=False).encode("utf-8")


def write_local_image(images_dir: Path, slug: str, disk: bytes | None,
                      *, revision: int = 1, family: str = "debian",
                      firmware: str = "bios") -> None:
    (images_dir / f"{slug}.metadata.yaml").write_bytes(
        metadata_bytes(slug, revision=revision, family=family,
                       firmware=firmware)
    )
    if disk is not None:
        (images_dir / f"{slug}.qcow2").write_bytes(disk)


@pytest.fixture
def cache_env(tmp_path, monkeypatch):
    images_dir = tmp_path / "images"
    images_dir.mkdir()
    monkeypatch.setattr(vm_service, "IMAGES_DIR", images_dir)
    monkeypatch.setattr(image_service, "IMAGES_DIR", images_dir)
    return images_dir


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

    def fake_qemu_img(args, **kwargs):
        if args[1] == "info":
            return subprocess.CompletedProcess(
                args, 0, json.dumps({"virtual-size": 9 * 2**30}))
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(vm_service.subprocess, "run", fake_qemu_img)
    yield cache_env, vms_dir
    engine.dispose()


def attach_s3(monkeypatch, objects: dict[str, bytes]) -> FakeS3:
    fake = FakeS3(objects)
    monkeypatch.setattr(vm_service, "s3", fake)
    monkeypatch.setattr(image_service, "s3", fake)
    return fake


def test_changed_revision_refreshes_disk_and_metadata_then_reuses_cache(
        cache_env, monkeypatch):
    write_local_image(cache_env, "debian", b"disk-v1",
                      revision=1, firmware="bios")
    (cache_env / "debian.qcow2").chmod(0o640)
    (cache_env / "debian.metadata.yaml").chmod(0o640)
    # Leftover staged and boto3 s3transfer temp files from a prior crash
    # are swept during refresh.
    stale_uuid = "0123456789abcdef0123456789abcdef"
    (cache_env / f".debian.qcow2.{stale_uuid}.tmp").write_bytes(b"leftover")
    (cache_env / f".debian.qcow2.{stale_uuid}.tmp.a1B2c3D4").write_bytes(
        b"s3transfer-leftover")
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": b"disk-v2-updated",
    })
    progress = Recorder()

    image_path = Vm._download_image("debian.qcow2", progress)

    assert image_path == cache_env / "debian.qcow2"
    assert image_path.read_bytes() == b"disk-v2-updated"
    assert stat.S_IMODE(image_path.stat().st_mode) == 0o640
    assert stat.S_IMODE(
        (cache_env / "debian.metadata.yaml").stat().st_mode) == 0o640
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None
    assert local.revision == 2
    assert local.firmware == "efi"
    assert [key for key, _ in fake.download_calls] == [
        "debian.metadata.yaml", "debian.qcow2"]
    assert progress.calls == [
        ("fetching_image", len(b"disk-v2-updated")), len(b"disk-v2-updated")]
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]

    # A follow-up check on the same revision reuses the cache.
    fake.download_calls.clear()
    progress_again = Recorder()
    assert Vm._download_image("debian.qcow2", progress_again) == image_path
    assert fake.download_calls == []
    assert progress_again.calls == []


def test_unchanged_revision_reuses_existing_cache(cache_env, monkeypatch):
    write_local_image(cache_env, "debian", b"cached-v1", revision=1)
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes("debian", revision=1),
        "debian.qcow2": b"remote-v1",
    })

    image_path = Vm._download_image("debian.qcow2")

    assert image_path == cache_env / "debian.qcow2"
    assert image_path.read_bytes() == b"cached-v1"
    assert fake.download_calls == []
    assert fake.head_calls == []


def test_unreachable_registry_reuses_valid_cached_image(
        cache_env, monkeypatch):
    write_local_image(cache_env, "debian", b"cached-v1", revision=1)
    fake = attach_s3(monkeypatch, {})
    fake.fail_gets["debian.metadata.yaml"] = RuntimeError("registry offline")

    assert Vm.has_revision_changed("debian.metadata.yaml") is False
    image_path = Vm._download_image("debian.qcow2")

    assert image_path.read_bytes() == b"cached-v1"
    assert fake.download_calls == []


def test_missing_disk_is_downloaded_when_metadata_is_current(
        cache_env, monkeypatch):
    write_local_image(cache_env, "debian", None, revision=1)
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes("debian", revision=1),
        "debian.qcow2": b"disk-v1",
    })

    image_path = Vm._download_image("debian.qcow2")

    assert image_path.read_bytes() == b"disk-v1"
    assert [key for key, _ in fake.download_calls] == [
        "debian.metadata.yaml", "debian.qcow2"]
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]


def test_missing_disk_refreshes_metadata_when_revision_check_fails_transiently(
        cache_env, monkeypatch):
    write_local_image(cache_env, "debian", None, revision=1, firmware="bios")
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": b"disk-v2",
    })
    # Initial get_object lookup fails so has_revision_changed returns False,
    # yet rebuilding the missing disk still stages verified metadata alongside it.
    fake.fail_gets["debian.metadata.yaml"] = RuntimeError("transient error")

    image_path = Vm._download_image("debian.qcow2")

    assert image_path.read_bytes() == b"disk-v2"
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None
    assert local.revision == 2
    assert local.firmware == "efi"
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]


def test_fresh_registry_image_downloads_metadata_and_disk(
        cache_env, monkeypatch):
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes("debian", revision=1),
        "debian.qcow2": b"disk-v1",
    })

    image_path = Vm._download_image("debian.qcow2")

    assert image_path.read_bytes() == b"disk-v1"
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None and local.revision == 1
    assert [key for key, _ in fake.download_calls] == [
        "debian.metadata.yaml", "debian.qcow2"]
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]


def test_failed_disk_download_preserves_previous_cache_and_allows_retry(
        cache_env, monkeypatch):
    write_local_image(cache_env, "debian", b"disk-v1",
                      revision=1, firmware="bios")
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": b"disk-v2",
    })
    fake.fail_downloads["debian.qcow2"] = (
        b"partial-corrupt", RuntimeError("network drop"))

    with pytest.raises(RuntimeError, match="network drop"):
        Vm._download_image("debian.qcow2")

    # Previous valid disk and metadata are preserved; cache is NOT marked current.
    assert (cache_env / "debian.qcow2").read_bytes() == b"disk-v1"
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None
    assert local.revision == 1
    assert local.firmware == "bios"
    assert Vm.has_revision_changed("debian.metadata.yaml") is True
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]

    # Once S3 recovers, the next call completes the refresh.
    fake.fail_downloads.clear()
    Vm._download_image("debian.qcow2")
    assert (cache_env / "debian.qcow2").read_bytes() == b"disk-v2"
    refreshed = ImageService.get_local_image("debian.metadata.yaml")
    assert refreshed is not None
    assert refreshed.revision == 2
    assert refreshed.firmware == "efi"


def test_failed_metadata_download_preserves_cache_and_skips_disk_download(
        cache_env, monkeypatch):
    write_local_image(cache_env, "debian", b"disk-v1", revision=1)
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes("debian", revision=2),
        "debian.qcow2": b"disk-v2",
    })
    fake.fail_downloads["debian.metadata.yaml"] = (
        b"partial-meta", RuntimeError("s3 timeout"))

    with pytest.raises(RuntimeError, match="s3 timeout"):
        Vm._download_image("debian.qcow2")

    assert [key for key, _ in fake.download_calls] == ["debian.metadata.yaml"]
    assert (cache_env / "debian.qcow2").read_bytes() == b"disk-v1"
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None and local.revision == 1
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]


@pytest.mark.parametrize("bad_metadata, expected_error", [
    (b"not: [valid: metadata", yaml.YAMLError),
    (yaml.safe_dump({"name": "debian", "image": "debian.qcow2"}).encode(),
     ValidationError),
    (metadata_bytes("debian", revision=2, image_name="other.qcow2"),
     ValueError),
])
def test_invalid_metadata_download_preserves_cache_and_skips_disk_download(
        cache_env, monkeypatch, bad_metadata, expected_error):
    write_local_image(cache_env, "debian", b"disk-v1", revision=1)
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes("debian", revision=2),
        "debian.qcow2": b"disk-v2",
    })
    original_download = fake.download_file

    def deliver_bad_metadata(bucket, key, path, Callback=None):
        if key == "debian.metadata.yaml":
            fake.download_calls.append((key, Path(path)))
            Path(path).write_bytes(bad_metadata)
            return
        return original_download(bucket, key, path, Callback=Callback)

    monkeypatch.setattr(fake, "download_file", deliver_bad_metadata)

    with pytest.raises(expected_error):
        Vm._download_image("debian.qcow2")

    assert [key for key, _ in fake.download_calls] == ["debian.metadata.yaml"]
    assert (cache_env / "debian.qcow2").read_bytes() == b"disk-v1"
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None and local.revision == 1
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]


def test_failed_backup_link_aborts_before_replacing_cached_disk(
        cache_env, monkeypatch):
    write_local_image(cache_env, "debian", b"disk-v1",
                      revision=1, firmware="bios")
    attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": b"disk-v2",
    })
    monkeypatch.setattr(
        vm_service.os, "link",
        Mock(side_effect=OSError("hard links unsupported")),
    )

    with pytest.raises(OSError, match="hard links unsupported"):
        Vm._download_image("debian.qcow2")

    assert (cache_env / "debian.qcow2").read_bytes() == b"disk-v1"
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None and local.revision == 1
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]


def test_failed_mid_swap_dir_fsync_rolls_back_disk_replacement(
        cache_env, monkeypatch):
    write_local_image(cache_env, "debian", b"disk-v1",
                      revision=1, firmware="bios")
    attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": b"disk-v2",
    })
    real_fsync_dir = Vm._fsync_dir
    calls = 0

    def fail_third_fsync(directory):
        nonlocal calls
        calls += 1
        # 1: after rollback link, 2: after commit marker, 3: after disk replace.
        if calls == 3:
            raise OSError("mid-swap dir fsync failed")
        return real_fsync_dir(directory)

    monkeypatch.setattr(Vm, "_fsync_dir", staticmethod(fail_third_fsync))

    with pytest.raises(OSError, match="mid-swap dir fsync failed"):
        Vm._download_image("debian.qcow2")

    assert (cache_env / "debian.qcow2").read_bytes() == b"disk-v1"
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None
    assert local.revision == 1
    assert local.firmware == "bios"
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]


def test_failed_metadata_replace_rolls_back_disk_replacement(
        cache_env, monkeypatch):
    write_local_image(cache_env, "debian", b"disk-v1",
                      revision=1, firmware="bios")
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": b"disk-v2",
    })
    real_replace = os.replace

    def fail_metadata_replace(src, dst):
        if Path(dst) == cache_env / "debian.metadata.yaml":
            raise OSError("metadata rename failed")
        return real_replace(src, dst)

    monkeypatch.setattr(vm_service.os, "replace", fail_metadata_replace)

    with pytest.raises(OSError, match="metadata rename failed"):
        Vm._download_image("debian.qcow2")

    # Both the previous rev 1 disk and metadata are restored cleanly.
    assert (cache_env / "debian.qcow2").read_bytes() == b"disk-v1"
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None
    assert local.revision == 1
    assert local.firmware == "bios"
    assert Vm.has_revision_changed("debian.metadata.yaml") is True
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]

    # Even if the registry then goes offline, the restored rev 1 pair is intact.
    fake.fail_gets["debian.metadata.yaml"] = RuntimeError("registry offline")
    assert Vm._download_image("debian.qcow2").read_bytes() == b"disk-v1"


def test_failed_metadata_replace_on_fresh_download_removes_orphan_disk(
        cache_env, monkeypatch):
    attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes("debian", revision=1),
        "debian.qcow2": b"disk-v1",
    })
    real_replace = os.replace

    def fail_metadata_replace(src, dst):
        if Path(dst) == cache_env / "debian.metadata.yaml":
            raise OSError("metadata rename failed")
        return real_replace(src, dst)

    monkeypatch.setattr(vm_service.os, "replace", fail_metadata_replace)

    with pytest.raises(OSError, match="metadata rename failed"):
        Vm._download_image("debian.qcow2")

    assert list(cache_env.iterdir()) == []


def test_interrupted_swap_is_recovered_before_cache_reuse(
        cache_env, monkeypatch):
    # Simulate a crash right after disk replacement, before metadata replacement.
    write_local_image(cache_env, "debian", b"disk-v2",
                      revision=1, firmware="bios")
    (cache_env / ".debian.qcow2.rollback.tmp").write_bytes(b"disk-v1")
    (cache_env / ".debian.metadata.yaml.commit.tmp").write_bytes(
        metadata_bytes("debian", revision=2, firmware="efi"))
    fake = attach_s3(monkeypatch, {})
    fake.fail_gets["debian.metadata.yaml"] = RuntimeError("registry offline")

    # Even offline, recovery restores rev 1 disk to match rev 1 metadata.
    image_path = Vm._download_image("debian.qcow2")
    assert image_path.read_bytes() == b"disk-v1"
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None and local.revision == 1 and local.firmware == "bios"
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]

    # Simulate a crash after metadata replacement, before rollback cleanup.
    write_local_image(cache_env, "debian", b"disk-v2",
                      revision=2, firmware="efi")
    (cache_env / ".debian.qcow2.rollback.tmp").write_bytes(b"disk-v1")

    image_path = Vm._download_image("debian.qcow2")
    assert image_path.read_bytes() == b"disk-v2"
    local = ImageService.get_local_image("debian.metadata.yaml")
    assert local is not None and local.revision == 2 and local.firmware == "efi"
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml", "debian.qcow2"]


def test_failed_missing_disk_download_leaves_no_partial_disk(
        cache_env, monkeypatch):
    write_local_image(cache_env, "debian", None, revision=1)
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes("debian", revision=1),
        "debian.qcow2": b"disk-v1",
    })
    fake.fail_downloads["debian.qcow2"] = (
        b"partial-disk", RuntimeError("disk failed"))

    with pytest.raises(RuntimeError, match="disk failed"):
        Vm._download_image("debian.qcow2")

    assert not (cache_env / "debian.qcow2").exists()
    assert sorted(p.name for p in cache_env.iterdir()) == [
        "debian.metadata.yaml"]


def test_glob_metacharacters_do_not_sweep_other_images_temp_files(
        cache_env, monkeypatch):
    active_temp = cache_env / ".debian.qcow2.0123456789abcdef0123456789abcdef.tmp"
    active_temp.write_bytes(b"in-flight-download")
    attach_s3(monkeypatch, {})

    with pytest.raises(NoSuchKeyError):
        Vm._download_image("*.qcow2")

    assert active_temp.exists()
    assert active_temp.read_bytes() == b"in-flight-download"


def test_local_only_imported_image_reuses_cache_without_registry_calls(
        cache_env, monkeypatch):
    write_local_image(cache_env, "course-vm", b"imported-disk",
                      revision=0, family="local", firmware="efi")
    # Even if the registry contains a colliding name with a different revision,
    # a local imported image must not be overwritten or queried.
    fake = attach_s3(monkeypatch, {
        "course-vm.metadata.yaml": metadata_bytes(
            "course-vm", revision=3, family="debian", firmware="bios"),
        "course-vm.qcow2": b"registry-disk",
    })

    assert Vm.has_revision_changed("course-vm.metadata.yaml") is False
    image_path = Vm._download_image("course-vm.qcow2")

    assert image_path == cache_env / "course-vm.qcow2"
    assert image_path.read_bytes() == b"imported-disk"
    local = ImageService.get_local_image("course-vm.metadata.yaml")
    assert local is not None
    assert local.family == "local"
    assert local.revision == 0
    assert local.firmware == "efi"
    assert fake.get_calls == []
    assert fake.head_calls == []
    assert fake.download_calls == []


def test_missing_local_imported_disk_fails_without_contacting_registry(
        cache_env, monkeypatch):
    write_local_image(cache_env, "course-vm", None,
                      revision=0, family="local", firmware="efi")
    fake = attach_s3(monkeypatch, {
        "course-vm.metadata.yaml": metadata_bytes(
            "course-vm", revision=1, family="debian", firmware="bios"),
        "course-vm.qcow2": b"registry-disk",
    })

    with pytest.raises(HTTPException) as error:
        Vm._download_image("course-vm.qcow2")

    assert error.value.status_code == 404
    assert not (cache_env / "course-vm.qcow2").exists()
    assert fake.get_calls == []
    assert fake.head_calls == []
    assert fake.download_calls == []


def test_local_only_image_absent_from_registry_is_reused(
        cache_env, monkeypatch):
    write_local_image(cache_env, "custom-debian", b"custom-disk",
                      revision=1, family="debian")
    fake = attach_s3(monkeypatch, {})

    assert Vm.has_revision_changed("custom-debian.metadata.yaml") is False
    image_path = Vm._download_image("custom-debian.qcow2")

    assert image_path.read_bytes() == b"custom-disk"
    assert fake.download_calls == []


def test_image_name_containing_qcow2_refreshes_and_resolves_efi_firmware(
        vm_env, monkeypatch):
    cache_env, vms_dir = vm_env
    write_local_image(cache_env, "my-qcow2-vm", b"disk-v1",
                      revision=1, firmware="bios")
    fake = attach_s3(monkeypatch, {
        "my-qcow2-vm.metadata.yaml": metadata_bytes(
            "my-qcow2-vm", revision=2, firmware="efi"),
        "my-qcow2-vm.qcow2": b"disk-v2",
    })

    vm = Vm(VmCreate(
        name="Named VM", os="my-qcow2-vm.qcow2", mem=2, vcpus=1,
        disk_size=10, activate_at_start=False,
    ))

    assert (vms_dir / str(vm.id) /
            "my-qcow2-vm.qcow2").read_bytes() == b"disk-v2"
    assert [key for key, _ in fake.download_calls] == [
        "my-qcow2-vm.metadata.yaml", "my-qcow2-vm.qcow2"]
    define_xml = vm_service.QEMUConfig.get_connection().defineXML
    assert '<os firmware="efi">' in define_xml.call_args.args[0]
    direct_xml = xml_builder.build_xml(VmCreateXML(
        id=vm.id, os="my-qcow2-vm.qcow2", name="Named VM",
        mem=2, vcpus=1, disk_size=10,
    ))
    assert '<os firmware="efi">' in direct_xml


def test_concurrent_revision_refreshes_download_once(cache_env, monkeypatch):
    write_local_image(cache_env, "debian", b"disk-v1", revision=1)
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes("debian", revision=2),
        "debian.qcow2": b"disk-v2",
    })
    first_downloading = threading.Event()
    second_waiting = threading.Event()
    release_first = threading.Event()
    real_lock = vm_service._image_download_lock
    enter_count = 0
    enter_guard = threading.Lock()

    @contextmanager
    def instrumented_lock(image_path):
        nonlocal enter_count
        with enter_guard:
            enter_count += 1
            order = enter_count
        if order == 2:
            second_waiting.set()
        with real_lock(image_path):
            yield

    monkeypatch.setattr(vm_service, "_image_download_lock", instrumented_lock)

    def on_download(key, _target):
        if key == "debian.qcow2" and not first_downloading.is_set():
            first_downloading.set()
            assert release_first.wait(5)

    fake.on_download = on_download

    results: list[bytes] = []
    errors: list[Exception] = []

    def worker():
        try:
            path = Vm._download_image("debian.qcow2")
            results.append(path.read_bytes())
        except Exception as exc:
            errors.append(exc)

    t1 = threading.Thread(target=worker)
    t2 = threading.Thread(target=worker)
    t1.start()
    assert first_downloading.wait(5)
    t2.start()
    assert second_waiting.wait(5)
    release_first.set()
    t1.join(5)
    t2.join(5)

    assert not t1.is_alive() and not t2.is_alive()
    assert errors == []
    assert results == [b"disk-v2", b"disk-v2"]
    assert [key for key, _ in fake.download_calls] == [
        "debian.metadata.yaml", "debian.qcow2"]
    assert vm_service._image_download_locks == {}


def test_vm_creation_uses_refreshed_disk_and_metadata(vm_env, monkeypatch):
    cache_env, vms_dir = vm_env
    write_local_image(cache_env, "debian", b"old-rev-1-disk",
                      revision=1, firmware="bios")
    attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": b"new-rev-2-disk",
    })

    vm = Vm(VmCreate(
        name="Refreshed VM", os="debian.qcow2", mem=2, vcpus=1,
        disk_size=10, activate_at_start=False,
    ))

    assert (vms_dir / str(vm.id) /
            "debian.qcow2").read_bytes() == b"new-rev-2-disk"
    define_xml = vm_service.QEMUConfig.get_connection().defineXML
    assert '<os firmware="efi">' in define_xml.call_args.args[0]


def test_create_vm_accepts_smaller_disk_when_registry_revision_shrinks_image(
        vm_env, monkeypatch):
    cache_env, vms_dir = vm_env
    write_local_image(cache_env, "debian", b"large-rev-1",
                      revision=1, firmware="bios")
    attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=2, firmware="efi"),
        "debian.qcow2": b"small-rev-2",
    })

    def size_by_content(args, **kwargs):
        if args[1] == "info":
            content = Path(args[-1]).read_bytes()
            gib = 30 if content == b"large-rev-1" else 10
            return subprocess.CompletedProcess(
                args, 0, json.dumps({"virtual-size": gib * 2**30}))
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(vm_service.subprocess, "run", size_by_content)

    vm = VmService.create_vm(VmCreate(
        name="Shrunk VM", os="debian.qcow2", mem=2, vcpus=1,
        disk_size=10, activate_at_start=False,
    ))

    assert (vms_dir / str(vm.id) /
            "debian.qcow2").read_bytes() == b"small-rev-2"
    define_xml = vm_service.QEMUConfig.get_connection().defineXML
    assert '<os firmware="efi">' in define_xml.call_args.args[0]

    # On the now-current 10 GiB revision, requesting 9 GiB is rejected at once.
    with pytest.raises(HTTPException) as error:
        VmService.create_vm(VmCreate(
            name="Too Small", os="debian.qcow2", mem=2, vcpus=1,
            disk_size=9, activate_at_start=False,
        ))
    assert error.value.status_code == 400
    assert error.value.detail == "Disk size must be at least 10 GB"


def test_concurrent_refresh_during_vm_copy_keeps_disk_and_firmware_consistent(
        vm_env, monkeypatch):
    cache_env, vms_dir = vm_env
    write_local_image(cache_env, "debian", b"rev-1-bios-disk",
                      revision=1, firmware="bios")
    fake = attach_s3(monkeypatch, {
        "debian.metadata.yaml": metadata_bytes(
            "debian", revision=1, firmware="bios"),
        "debian.qcow2": b"rev-1-bios-disk",
    })
    copy_started = threading.Event()
    refresh_done = threading.Event()
    real_copy = vm_service.copy_disk

    def paused_copy(source, target, progress, *, source_file=None):
        copy_started.set()
        assert refresh_done.wait(5)
        real_copy(source, target, progress, source_file=source_file)

    monkeypatch.setattr(vm_service, "copy_disk", paused_copy)

    created: list[Vm] = []
    errors: list[Exception] = []

    def create_first_vm():
        try:
            created.append(Vm(VmCreate(
                name="In-flight VM", os="debian.qcow2", mem=2, vcpus=1,
                disk_size=10, activate_at_start=False,
            )))
        except Exception as exc:
            errors.append(exc)

    thread = threading.Thread(target=create_first_vm)
    thread.start()
    assert copy_started.wait(5)

    # Registry publishes revision 2 with EFI firmware while VM 1 is copying.
    fake.objects["debian.metadata.yaml"] = metadata_bytes(
        "debian", revision=2, firmware="efi")
    fake.objects["debian.qcow2"] = b"rev-2-efi-disk"
    assert Vm._download_image("debian.qcow2").read_bytes() == b"rev-2-efi-disk"
    refresh_done.set()
    thread.join(5)

    assert not thread.is_alive()
    assert errors == []
    [vm1] = created
    assert (vms_dir / str(vm1.id) /
            "debian.qcow2").read_bytes() == b"rev-1-bios-disk"
    define_xml = vm_service.QEMUConfig.get_connection().defineXML
    assert 'firmware="efi"' not in define_xml.call_args.args[0]

    # A subsequent VM gets revision 2's disk and EFI firmware together.
    monkeypatch.setattr(vm_service, "copy_disk", real_copy)
    vm2 = Vm(VmCreate(
        name="Post-refresh VM", os="debian.qcow2", mem=2, vcpus=1,
        disk_size=10, activate_at_start=False,
    ))
    assert (vms_dir / str(vm2.id) /
            "debian.qcow2").read_bytes() == b"rev-2-efi-disk"
    assert '<os firmware="efi">' in define_xml.call_args.args[0]
