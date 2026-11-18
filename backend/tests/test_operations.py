import importlib
import json
import os
import subprocess
import threading
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlmodel import Session, SQLModel, create_engine, select

from app.models.image import ImageRead
from app.models.vm import RecoverableVmCreate, VmCreate
from app.orm.operation import OperationORM
from app.orm.slave import SlaveORM
from app.orm.user import UserORM
from app.orm.vm import VmORM
from app.routes import operation as operation_routes
from app.routes import vm as vm_routes
from app.services import operation_service, slave_client, slave_service, vm_service
from app.services.operation_service import OperationProgress, OperationService, Progress
from app.services.vm_service import Vm, VmService
from app.utils.auth import get_current_user

os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")

DISK = b"disk image" * 1000
IMAGE = ImageRead(name="Test", image="test.qcow2", version="1",
                  distribution="test", family="test", revision=1)


class QemuImg:
    """Stands in for qemu-img. `resize` can be held back, or made to fail."""

    def __init__(self):
        self.resizing = threading.Event()
        self.may_resize = threading.Event()
        self.may_resize.set()
        self.resize_error = ""

    def __call__(self, args, **kwargs):
        if args[1] == "info":
            return subprocess.CompletedProcess(
                args, 0, json.dumps({"virtual-size": 9 * 2**30}))
        self.resizing.set()
        assert self.may_resize.wait(10)
        return subprocess.CompletedProcess(
            args, 1 if self.resize_error else 0, "", self.resize_error)


class Recorder(Progress):
    def __init__(self):
        self.calls = []

    def phase(self, phase, bytes_total=None):
        self.calls.append((phase, bytes_total))

    def advance(self, bytes_done):
        self.calls.append(bytes_done)


@pytest.fixture
def host(tmp_path, monkeypatch):
    images, vms = tmp_path / "images", tmp_path / "vms"
    images.mkdir()
    vms.mkdir()
    (images / "test.qcow2").write_bytes(DISK)
    # A database file: jobs write from their own thread.
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}")
    SQLModel.metadata.create_all(engine)
    for module in (vm_service, operation_service, slave_service):
        monkeypatch.setattr(module, "engine", engine)
    monkeypatch.setattr(operation_service, "_alive", set())
    monkeypatch.setattr(vm_service, "IMAGES_DIR", images)
    monkeypatch.setattr(vm_service, "VMS_DIR", vms)
    monkeypatch.setattr(vm_service.Vm, "has_revision_changed",
                        staticmethod(lambda metadata_filename: False))
    monkeypatch.setattr(vm_service, "ensure_seed_iso", Mock())
    monkeypatch.setattr(vm_service, "QEMUConfig", Mock())
    monkeypatch.setattr(vm_service.ImageService, "get_distribox_image",
                        staticmethod(lambda metadata_filename: IMAGE))
    qemu_img = QemuImg()
    monkeypatch.setattr(vm_service.subprocess, "run", qemu_img)
    yield SimpleNamespace(engine=engine, vms=vms, qemu_img=qemu_img)
    qemu_img.may_resize.set()
    engine.dispose()


def user(*policies):
    return UserORM(username="host", hashed_password="unused",
                   policies=list(policies))


CREATOR = user("vms:create")


def vm_create(**fields):
    return VmCreate(**{
        "name": "VM", "os": "test.qcow2", "mem": 2, "vcpus": 1,
        "disk_size": 9, "activate_at_start": False, **fields})


def wait_for(operation):
    for thread in threading.enumerate():
        if thread.name == f"operation-{operation.id}":
            thread.join(10)
            assert not thread.is_alive()


def start_held_at_resize(host):
    """A creation whose disk is copied and which then waits."""
    host.qemu_img.may_resize.clear()
    operation = VmService.start_vm_creation(vm_create(), "host")
    assert host.qemu_img.resizing.wait(10)
    return operation


def finish(host, operation):
    host.qemu_img.may_resize.set()
    wait_for(operation)


def stored(host, model=OperationORM):
    with Session(host.engine) as session:
        return session.exec(select(model)).all()


def recoverable_ids():
    return [vm.vm_id for vm in VmService.get_recoverable_vms()]


def test_creation_returns_at_once_and_is_listed_with_its_progress(host):
    operation = start_held_at_resize(host)

    assert operation.status == "running"
    assert operation.phases == [
        "fetching_image", "copying_disk", "resizing_disk", "defining"]
    assert operation.params["name"] == "VM"
    assert operation.created_by == "host"
    [listed] = OperationService.list_operations(CREATOR)
    assert (listed.id, listed.vm_id) == (operation.id, operation.vm_id)
    assert (listed.status, listed.phase) == ("running", "resizing_disk")
    assert listed.indeterminate and listed.finished_at is None
    assert stored(host, VmORM) == []

    finish(host, operation)

    [listed] = OperationService.list_operations(CREATOR)
    assert (listed.status, listed.error) == ("succeeded", None)
    assert listed.finished_at is not None
    assert [vm.id for vm in stored(host, VmORM)] == [operation.vm_id]
    assert (host.vms / str(operation.vm_id) /
            "test.qcow2").read_bytes() == DISK


def test_creation_in_progress_is_not_untracked(host):
    operation = start_held_at_resize(host)
    vm_id = str(operation.vm_id)
    assert (host.vms / vm_id / "test.qcow2").exists()

    assert recoverable_ids() == []
    with pytest.raises(HTTPException) as recover_error:
        VmService.recover_vm(RecoverableVmCreate(
            vm_id=operation.vm_id, name="VM", mem=2, vcpus=1, disk_size=9))
    with pytest.raises(HTTPException) as remove_error:
        VmService.remove_recoverable_vm(vm_id)
    VmService.remove_all_recoverable_vms()

    assert recover_error.value.status_code == 404
    assert remove_error.value.status_code == 404
    assert (host.vms / vm_id / "test.qcow2").exists()
    assert stored(host, VmORM) == []

    finish(host, operation)

    assert recoverable_ids() == []
    assert [vm.id for vm in stored(host, VmORM)] == [operation.vm_id]


def test_creation_ending_during_the_listing_is_not_untracked(
        host, monkeypatch):
    operation = start_held_at_resize(host)
    running_vm_ids = OperationService.running_vm_ids

    def end_creation_then_answer():
        finish(host, operation)
        return running_vm_ids()
    monkeypatch.setattr(OperationService, "running_vm_ids",
                        staticmethod(end_creation_then_answer))

    assert recoverable_ids() == []


def test_failed_creation_shows_its_error_and_is_untracked(host):
    host.qemu_img.resize_error = "qemu-img: No space left on device\n"

    operation = VmService.start_vm_creation(vm_create(), "host")
    wait_for(operation)

    [listed] = OperationService.list_operations(CREATOR)
    assert (listed.status, listed.phase) == ("failed", "resizing_disk")
    assert listed.error == (
        "Could not resize the disk: qemu-img: No space left on device")
    assert stored(host, VmORM) == []
    assert recoverable_ids() == [str(operation.vm_id)]
    VmService.remove_recoverable_vm(str(operation.vm_id))
    assert not (host.vms / str(operation.vm_id)).exists()


def test_creation_interrupted_by_a_restart_is_untracked(host):
    operation = OperationService.create(
        "vm.create", "VM", ["copying_disk"], vm_id=uuid4())
    folder = host.vms / str(operation.vm_id)
    folder.mkdir()
    (folder / "test.qcow2").write_bytes(DISK[:10])
    assert recoverable_ids() == []

    operation_service._alive.clear()
    OperationService.interrupt_orphans()

    [listed] = OperationService.list_operations(CREATOR)
    assert listed.status == "interrupted"
    assert listed.error == "The backend stopped before this finished."
    assert listed.finished_at is not None
    assert recoverable_ids() == [str(operation.vm_id)]


def test_listing_closes_an_operation_whose_thread_is_gone(host):
    operation = OperationService.create("vm.create", "VM", ["copying_disk"])
    operation_service._alive.clear()

    assert [listed.status for listed in
            OperationService.list_operations(CREATOR)] == ["interrupted"]
    assert OperationService.get_operation(
        operation.id, CREATOR).status == "interrupted"


def test_finished_operation_keeps_its_outcome(host):
    operation = OperationService.create("vm.create", "VM", ["copying_disk"])
    OperationService.run(operation.id, lambda progress: None)
    operation_service._alive.clear()

    OperationService.interrupt_orphans()
    OperationProgress(operation.id).phase("resizing_disk")

    [listed] = OperationService.list_operations(CREATOR)
    assert (listed.status, listed.phase) == ("succeeded", "copying_disk")


def test_waiting_creation_is_recorded_and_returns_the_vm(host):
    vm = VmService.create_vm(vm_create(name="Seat"))

    assert isinstance(vm, Vm)
    [listed] = OperationService.list_operations(CREATOR)
    assert (listed.status, listed.name, listed.created_by) == (
        "succeeded", "Seat", None)
    assert listed.vm_id == vm.id


def test_waiting_creation_raises_and_records_its_failure(host):
    host.qemu_img.resize_error = "no space"

    with pytest.raises(HTTPException) as error:
        VmService.create_vm(vm_create())

    assert error.value.status_code == 500
    [listed] = OperationService.list_operations(CREATOR)
    assert listed.status == "failed"
    assert operation_service._alive == set()


def test_disk_smaller_than_a_local_image_is_rejected_at_once(host):
    with pytest.raises(HTTPException) as error:
        VmService.start_vm_creation(vm_create(disk_size=8), "host")

    assert error.value.status_code == 400
    assert error.value.detail == "Disk size must be at least 9 GB"
    assert stored(host) == []
    assert list(host.vms.iterdir()) == []


def test_vm_is_recorded_after_it_started(host, monkeypatch):
    records_at_start = []
    monkeypatch.setattr(vm_service.Vm, "start", lambda self: (
        records_at_start.extend(stored(host, VmORM))))

    VmService.create_vm(vm_create(activate_at_start=True))

    assert records_at_start == []
    assert len(stored(host, VmORM)) == 1
    [listed] = OperationService.list_operations(CREATOR)
    assert listed.phases[-1] == listed.phase == "starting"


def test_vm_that_fails_to_start_is_still_tracked(host, monkeypatch):
    def start(self):
        raise HTTPException(409, "Failed to start VM")
    monkeypatch.setattr(vm_service.Vm, "start", start)

    with pytest.raises(HTTPException):
        VmService.create_vm(vm_create(activate_at_start=True))

    [listed] = OperationService.list_operations(CREATOR)
    assert (listed.status, listed.phase, listed.error) == (
        "failed", "starting", "Failed to start VM")
    assert [vm.id for vm in stored(host, VmORM)] == [listed.vm_id]
    assert recoverable_ids() == []


@pytest.mark.parametrize("slave_honors_id", [True, False])
def test_slave_creation_is_tracked(host, monkeypatch, slave_honors_id):
    slave = SlaveORM(name="Node", hostname="node", api_key="key",
                     status="online")
    slave_id = slave.id
    with Session(host.engine) as session:
        session.add(slave)
        session.commit()
    older_slave_id = str(uuid4())
    payloads = []

    def slave_create_vm(slave, payload):
        payloads.append(payload)
        return {"id": payload["id"] if slave_honors_id else older_slave_id}
    monkeypatch.setattr(slave_client, "slave_create_vm", slave_create_vm)

    operation = VmService.start_vm_creation(
        vm_create(slave_id=slave_id), "host")
    wait_for(operation)

    assert operation.phases == ["creating_on_node"]
    assert (operation.slave_id, operation.slave_name) == (slave_id, "Node")
    assert payloads[0]["id"] == str(operation.vm_id)
    [listed] = OperationService.list_operations(CREATOR)
    assert (listed.status, listed.indeterminate) == ("succeeded", True)
    [record] = stored(host, VmORM)
    assert record.id == listed.vm_id and record.slave_id == slave_id
    assert str(record.id) == (
        payloads[0]["id"] if slave_honors_id else older_slave_id)


def test_offline_slave_is_rejected_at_once(host):
    slave = SlaveORM(name="Node", hostname="node", api_key="key")
    slave_id = slave.id
    with Session(host.engine) as session:
        session.add(slave)
        session.commit()

    with pytest.raises(HTTPException) as error:
        VmService.start_vm_creation(vm_create(slave_id=slave_id), "host")

    assert error.value.status_code == 409
    assert stored(host) == []


def api_client(current_user):
    app = FastAPI()
    app.include_router(vm_routes.router, prefix="/vms")
    app.include_router(operation_routes.router, prefix="/operations")
    app.dependency_overrides[get_current_user] = lambda: current_user
    return TestClient(app)


def test_post_vms_answers_with_the_operation(host):
    response = api_client(CREATOR).post(
        "/vms/", json=vm_create().model_dump(mode="json"))

    assert response.status_code == 202
    body = response.json()
    wait_for(SimpleNamespace(id=body["id"]))
    assert (body["kind"], body["status"]) == ("vm.create", "running")
    assert body["created_by"] == "host"
    assert body["created_at"].endswith("Z")
    listed = api_client(CREATOR).get("/operations/").json()
    assert [(item["id"], item["vm_id"], item["status"]) for item in listed] \
        == [(body["id"], body["vm_id"], "succeeded")]
    assert [str(vm.id) for vm in stored(host, VmORM)] == [body["vm_id"]]


@pytest.mark.parametrize("policies, visible", [
    (["vms:get", "vms:getById", "vms:getRecoverableVms"], False),
    (["vms:create"], True),
    (["distribox:admin"], True),
])
def test_operations_are_shown_to_users_who_can_create_vms(
        host, policies, visible):
    operation = VmService.start_vm_creation(vm_create(), "host")
    wait_for(operation)
    client = api_client(user(*policies))

    listed = client.get("/operations/")
    fetched = client.get(f"/operations/{operation.id}")
    dismissed = client.delete(f"/operations/{operation.id}")

    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == (
        [str(operation.id)] if visible else [])
    assert fetched.status_code == (200 if visible else 404)
    assert dismissed.status_code == (204 if visible else 404)
    assert len(stored(host)) == (0 if visible else 1)


def test_only_finished_operations_can_be_dismissed(host):
    operation = start_held_at_resize(host)
    client = api_client(CREATOR)

    running = client.delete(f"/operations/{operation.id}")
    finish(host, operation)
    finished = client.delete(f"/operations/{operation.id}")

    assert running.status_code == 409
    assert running.json()["detail"] == "This operation is still running"
    assert finished.status_code == 204
    assert client.get("/operations/").json() == []
    assert client.get(f"/operations/{operation.id}").status_code == 404


def test_finished_operations_expire(host):
    def finished(outcome, hours_ago):
        operation = OperationORM(
            kind="vm.create", name=outcome, phases=["copying_disk"],
            phase="copying_disk", status=outcome,
            finished_at=datetime.now(timezone.utc) - timedelta(
                hours=hours_ago))
        with Session(host.engine) as session:
            session.add(operation)
            session.commit()
    finished("succeeded", 23)
    finished("succeeded", 25)
    finished("failed", 25)
    finished("interrupted", 24 * 8)

    listed = OperationService.list_operations(CREATOR)
    OperationService.purge_expired()

    assert sorted(operation.status for operation in listed) == [
        "failed", "succeeded"]
    assert len(stored(host)) == 2


def test_progress_is_written_at_most_once_per_interval(host, monkeypatch):
    clock = SimpleNamespace(now=100.0)
    monkeypatch.setattr(operation_service.time, "monotonic",
                        lambda: clock.now)
    operation = OperationService.create("vm.create", "VM", ["copying_disk"])
    progress = OperationProgress(operation.id)

    def written():
        operation = stored(host)[0]
        return operation.phase, operation.bytes_done, operation.bytes_total

    progress.phase("copying_disk", 1000)
    assert written() == ("copying_disk", 0, 1000)
    clock.now += 0.5
    progress.advance(300)
    assert written() == ("copying_disk", 0, 1000)
    clock.now += 0.5
    progress.advance(600)
    assert written() == ("copying_disk", 600, 1000)
    progress.advance(700)
    assert written() == ("copying_disk", 600, 1000)
    progress.phase("resizing_disk")
    assert written() == ("resizing_disk", None, None)


def test_copy_reports_bytes_and_flushes_as_it_goes(tmp_path, monkeypatch):
    source, target = tmp_path / "source.qcow2", tmp_path / "target.qcow2"
    source.write_bytes(os.urandom(10_000))
    source.chmod(0o640)
    monkeypatch.setattr(vm_service, "COPY_CHUNK_SIZE", 4096)
    monkeypatch.setattr(vm_service, "COPY_SYNC_INTERVAL", 8192)
    fsync = Mock(side_effect=os.fsync)
    monkeypatch.setattr(vm_service.os, "fsync", fsync)
    progress = Recorder()

    vm_service.copy_disk(source, target, progress)

    assert target.read_bytes() == source.read_bytes()
    assert target.stat().st_mode == source.stat().st_mode
    assert progress.calls == [4096, 8192, 10_000]
    assert fsync.call_count == 2


def test_registry_download_reports_bytes(tmp_path, monkeypatch):
    s3 = Mock()
    s3.head_object.return_value = {"ContentLength": 100}

    def download_file(bucket, key, path, Callback):
        Callback(40)
        Callback(60)
    s3.download_file.side_effect = download_file
    monkeypatch.setattr(vm_service, "s3", s3)
    progress = Recorder()

    Vm._download_registry_image("test.qcow2", tmp_path / "test.qcow2",
                                progress)

    assert progress.calls == [("fetching_image", 100), 40, 100]


def test_migration_creates_the_table_the_model_describes():
    migration = importlib.import_module(
        "app.migrations.versions.0004_operations")
    engine = create_engine("sqlite://")
    with engine.connect() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        migrated = {column["name"]: column["nullable"] for column in
                    inspect(connection).get_columns("operations")}
    engine.dispose()

    assert migrated == {column.name: column.nullable for column in
                        OperationORM.__table__.columns}
