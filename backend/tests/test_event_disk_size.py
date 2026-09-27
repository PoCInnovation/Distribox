import json
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, call

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.models.event import EventCreate, EventUpdate
from app.orm.event import EventORM
from app.services import event_service, vm_service

IMAGE_SIZES = {"small.qcow2": 9, "large.qcow2": 30}


@pytest.fixture
def engine(tmp_path, monkeypatch):
    for image in IMAGE_SIZES:
        (tmp_path / image).write_bytes(b"")
    monkeypatch.setattr(vm_service, "IMAGES_DIR", tmp_path)
    monkeypatch.setattr(vm_service, "s3", Mock())
    monkeypatch.setattr(vm_service.Vm, "has_revision_changed",
                        staticmethod(lambda metadata_filename: False))
    monkeypatch.setattr(event_service.EventService,
                        "_check_host_resources", Mock())
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(event_service, "engine", engine)
    yield engine
    engine.dispose()


@pytest.fixture
def qemu_img(monkeypatch):
    def info(args, **kwargs):
        size = IMAGE_SIZES[Path(args[-1]).name] * 2**30
        return subprocess.CompletedProcess(
            args, 0, json.dumps({"virtual-size": size}))
    run = Mock(side_effect=info)
    monkeypatch.setattr(vm_service.subprocess, "run", run)
    return run


def create_event(disk_size):
    return event_service.EventService.create_event(EventCreate(
        name="Workshop", slug="workshop", vm_os="small.qcow2", vm_mem=2,
        vm_vcpus=1, vm_disk_size=disk_size, max_vms=2,
        deadline=datetime.now(timezone.utc) + timedelta(hours=1),
    ), "host")


def update_event(event_id, **fields):
    return event_service.EventService.update_event(
        event_id, EventUpdate(**fields))


def store_event(engine, disk_size):
    event = EventORM(
        name="Workshop", slug="workshop", vm_os="small.qcow2", vm_mem=2,
        vm_vcpus=1, vm_disk_size=disk_size, max_vms=2, created_by="host",
        deadline=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    event_id = str(event.id)
    with Session(engine) as session:
        session.add(event)
        session.commit()
    return event_id


def stored_events(engine):
    with Session(engine) as session:
        return [(event.vm_os, event.vm_disk_size)
                for event in session.exec(select(EventORM)).all()]


def test_create_accepts_disk_matching_image(engine, qemu_img):
    create_event(9)

    assert stored_events(engine) == [("small.qcow2", 9)]


def test_create_rejects_disk_smaller_than_image(engine, qemu_img):
    with pytest.raises(HTTPException) as error:
        create_event(8)

    assert error.value.status_code == 400
    assert error.value.detail == "Disk size must be at least 9 GB"
    assert stored_events(engine) == []


def test_create_downloads_missing_registry_image(
        engine, qemu_img, tmp_path, monkeypatch):
    (tmp_path / "small.qcow2").unlink()
    monkeypatch.setattr(vm_service.Vm, "has_revision_changed",
                        staticmethod(lambda metadata_filename: True))

    with pytest.raises(HTTPException):
        create_event(8)

    assert vm_service.s3.download_file.call_args_list == [
        call(vm_service.distribox_bucket_registry, "small.metadata.yaml",
             tmp_path / "small.metadata.yaml"),
        call(vm_service.distribox_bucket_registry, "small.qcow2",
             tmp_path / "small.qcow2"),
    ]
    assert qemu_img.call_args.args[0][-1] == str(tmp_path / "small.qcow2")


@pytest.mark.parametrize("update, detail", [
    ({"vm_disk_size": 8}, "Disk size must be at least 9 GB"),
    ({"vm_os": "large.qcow2"}, "Disk size must be at least 30 GB"),
])
def test_update_rejects_disk_smaller_than_image(
        engine, qemu_img, update, detail):
    event_id = store_event(engine, 9)

    with pytest.raises(HTTPException) as error:
        update_event(event_id, **update)

    assert error.value.status_code == 400
    assert error.value.detail == detail
    assert stored_events(engine) == [("small.qcow2", 9)]


def test_update_accepts_disk_matching_new_image(engine, qemu_img):
    event_id = store_event(engine, 9)

    update_event(event_id, vm_os="large.qcow2", vm_disk_size=30)

    assert stored_events(engine) == [("large.qcow2", 30)]


@pytest.mark.parametrize("update", [
    {"name": "Renamed"},
    {"vm_os": "small.qcow2", "vm_disk_size": 5},
])
def test_update_skips_check_when_disk_and_image_are_unchanged(
        engine, qemu_img, update):
    event_id = store_event(engine, 5)

    update_event(event_id, **update)

    assert stored_events(engine) == [("small.qcow2", 5)]
    qemu_img.assert_not_called()
