from app.utils.auth import get_current_user
from app.services import slave_client, vm_service
from app.routes import event, vm
from app.orm.vm import VmORM
from app.orm.user import UserORM
from app.orm.slave import SlaveORM
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from fastapi import FastAPI
import pytest
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
from uuid import uuid4

os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")


VM_PAYLOAD = {
    "name": "Participant VM", "os": "test.qcow2", "mem": 2,
    "vcpus": 1, "disk_size": 10, "activate_at_start": True,
    "ssh_enabled": True,
}
EVENT_PAYLOAD = {
    "name": "Workshop", "slug": "workshop", "vm_os": "test.qcow2",
    "vm_mem": 2, "vm_vcpus": 1, "vm_disk_size": 10,
    "deadline": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    "max_vms": 1, "ssh_enabled": True,
}


def api_client(policies):
    app = FastAPI()
    app.include_router(vm.router, prefix="/vms")
    app.include_router(event.router, prefix="/events")
    app.dependency_overrides[get_current_user] = lambda: UserORM(
        username="host", hashed_password="unused", policies=policies,
    )
    return TestClient(app)


@pytest.mark.parametrize("can_manage", [False, True])
def test_vm_creation_cannot_bypass_ssh_permission(monkeypatch, can_manage):
    create = Mock(return_value={
        **VM_PAYLOAD, "id": str(uuid4()), "state": "Running", "ipv4": None,
    })
    monkeypatch.setattr(vm_service.VmService, "create_vm", create)
    policies = ["vms:create"] + (["vms:ssh:manage"] if can_manage else [])
    response = api_client(policies).post("/vms/", json=VM_PAYLOAD)
    assert response.status_code == (201 if can_manage else 403)
    assert create.called == can_manage
    if can_manage:
        assert response.json()["ssh_enabled"]


@pytest.mark.parametrize("can_manage", [False, True])
def test_event_creation_cannot_bypass_ssh_permission(monkeypatch, can_manage):
    create = Mock(return_value={
        **EVENT_PAYLOAD, "id": str(uuid4()), "vm_distribution": "",
        "created_at": datetime.now(timezone.utc), "created_by": "host",
    })
    monkeypatch.setattr(event.EventService, "create_event", create)
    policies = ["events:create"] + (["vms:ssh:manage"] if can_manage else [])
    response = api_client(policies).post("/events/", json=EVENT_PAYLOAD)
    assert response.status_code == (201 if can_manage else 403)
    assert create.called == can_manage


@pytest.mark.parametrize("enabled", [False, True])
def test_event_update_requires_ssh_permission_for_either_setting(monkeypatch, enabled):
    update = Mock()
    monkeypatch.setattr(event.EventService, "update_event", update)
    response = api_client(["events:update"]).patch(
        f"/events/{uuid4()}", json={"ssh_enabled": enabled},
    )
    assert response.status_code == 403
    update.assert_not_called()


def test_unrelated_event_update_preserves_existing_ssh_setting(monkeypatch):
    update = Mock(return_value={
        **EVENT_PAYLOAD, "id": str(uuid4()), "vm_distribution": "",
        "created_at": datetime.now(timezone.utc), "created_by": "host",
    })
    monkeypatch.setattr(event.EventService, "update_event", update)
    response = api_client(["events:update"]).patch(
        f"/events/{uuid4()}", json={"name": "Renamed workshop"},
    )
    assert response.status_code == 200
    assert response.json()["ssh_enabled"]
    assert "ssh_enabled" not in update.call_args.args[1].model_dump(
        exclude_unset=True)


@pytest.mark.parametrize("operation", ["get_vm", "get_vm_list", "start_vm", "stop_vm", "restart_vm"])
@pytest.mark.parametrize("enabled", [False, True])
def test_slave_responses_use_authoritative_host_setting(monkeypatch, operation, enabled):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(vm_service, "engine", engine)
    slave = SlaveORM(
        name="Host", hostname="private-host", api_key="test", status="online",
    )
    record = VmORM(
        name="VM", os="test.qcow2", mem=2, vcpus=1, disk_size=10,
        slave_id=slave.id, ssh_enabled=enabled,
    )
    vm_id, slave_id = str(record.id), str(slave.id)
    with Session(engine) as session:
        session.add(slave)
        session.add(record)
        session.commit()
    for function in ("slave_get_vm", "slave_start_vm", "slave_stop_vm"):
        monkeypatch.setattr(slave_client, function, lambda *args: {
            "id": vm_id, "state": "Running", "ssh_enabled": not enabled,
        })
    try:
        if operation == "get_vm_list":
            response = vm_service.VmService.get_vm_list()[0]
        else:
            response = getattr(vm_service.VmService, operation)(vm_id)
        assert response["ssh_enabled"] == enabled
        assert response["slave_id"] == slave_id
        assert response["slave_name"] == "Host"
    finally:
        engine.dispose()
