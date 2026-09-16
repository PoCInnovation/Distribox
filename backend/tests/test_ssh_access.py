from app.utils.crypto import encrypt_secret
from app.utils.auth import get_current_user
from app.services import event_service, ssh_access, ssh_gateway, vm_service
from app.routes import ssh
from app.orm.vm_credential import VmCredentialORM
from app.orm.vm import VmORM
from app.orm.user import UserORM
from app.orm.slave import SlaveORM
from app.orm.event import EventORM, EventParticipantORM
from app.models.event import EventUpdate
from app.models.vm import VmCredentialCreateRequest
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from fastapi import FastAPI, HTTPException
import pytest
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")


@pytest.fixture
def database(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    for module in (ssh_access, ssh, event_service, vm_service):
        monkeypatch.setattr(module, "engine", engine)
    vm = VmORM(name="Participant VM", os="test.qcow2", mem=2, vcpus=1,
               disk_size=10, ssh_enabled=True)
    credential = VmCredentialORM(
        vm_id=vm.id, name="participant",
        password=encrypt_secret("participant-access-secret"),
    )
    vm_id, credential_id = vm.id, credential.id
    with Session(engine) as session:
        session.add(vm)
        session.add(credential)
        session.commit()
    yield engine, vm_id, credential_id
    engine.dispose()


def add_event(engine, vm_id, deadline):
    event = EventORM(
        name="Workshop", slug="workshop", vm_os="test.qcow2", vm_mem=2,
        vm_vcpus=1, vm_disk_size=10, max_vms=1, deadline=deadline,
        created_by="host", ssh_enabled=True,
    )
    event_id = event.id
    with Session(engine) as session:
        session.add(event)
        session.add(EventParticipantORM(
            event_id=event.id, vm_id=vm_id, participant_name="participant"
        ))
        session.commit()
    return event_id


def test_authentication_requires_the_matching_secret(database):
    _, vm_id, credential_id = database
    assert ssh_access.authenticate_ssh(
        str(credential_id), "participant-access-secret") == str(vm_id)
    assert ssh_access.authenticate_ssh(
        str(credential_id), str(credential_id)) is None
    assert ssh_access.authenticate_ssh(
        str(uuid4()), "participant-access-secret") is None
    assert ssh_access.authenticate_ssh(
        "invalid", "participant-access-secret") is None
    assert not ssh_access.ssh_access_valid(str(credential_id), str(uuid4()))


@pytest.mark.parametrize("change", ["disabled", "expired", "revoked", "deleted", "event_expired"])
def test_access_changes_reject_new_and_existing_sessions(database, change):
    engine, vm_id, credential_id = database
    if change == "event_expired":
        add_event(engine, vm_id, datetime.now(
            timezone.utc) - timedelta(seconds=1))
    with Session(engine) as session:
        vm = session.get(VmORM, vm_id)
        credential = session.get(VmCredentialORM, credential_id)
        if change == "disabled":
            vm.ssh_enabled = False
            session.add(vm)
        elif change == "expired":
            credential.expires_at = datetime.now(
                timezone.utc) - timedelta(seconds=1)
            session.add(credential)
        elif change == "revoked":
            session.delete(credential)
        elif change == "deleted":
            session.delete(vm)
        session.commit()
    assert not ssh_access.ssh_access_valid(str(credential_id), str(vm_id))
    assert ssh_access.authenticate_ssh(
        str(credential_id), "participant-access-secret") is None


def test_event_changes_apply_to_existing_vms_and_credentials(database):
    engine, vm_id, credential_id = database
    event_id = add_event(engine, vm_id, datetime.now(
        timezone.utc) + timedelta(hours=1))
    deadline = datetime.now(timezone.utc) + timedelta(minutes=30)
    event_service.EventService.update_event(
        str(event_id), EventUpdate(ssh_enabled=False, deadline=deadline)
    )
    with Session(engine) as session:
        assert not session.get(VmORM, vm_id).ssh_enabled
        assert session.get(
            VmCredentialORM, credential_id).expires_at == deadline.replace(tzinfo=None)
    assert not ssh_access.ssh_access_valid(str(credential_id), str(vm_id))


@pytest.fixture
def client(database, monkeypatch):
    monkeypatch.setattr(
        ssh_gateway, "get_ssh_host_fingerprint", lambda: "SHA256:test")
    monkeypatch.setenv("SSH_PUBLIC_HOST", "ssh.example.com")
    app = FastAPI()
    app.include_router(ssh.router)
    app.dependency_overrides[get_current_user] = lambda: UserORM(
        username="viewer", hashed_password="unused", policies=["vms:connect"]
    )
    return TestClient(app)


def test_connection_details_require_secret_and_never_return_guest_keys(client, database):
    _, _, credential_id = database
    response = client.post(
        "/ssh/connection", json={"credential": "participant-access-secret"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "enabled": True, "available": True, "host": "ssh.example.com", "port": 2222,
        "host_key_fingerprint": "SHA256:test", "credential_id": str(credential_id),
        "vm_name": "Participant VM", "expires_at": None,
    }
    assert client.post(
        "/ssh/connection", json={"credential": str(credential_id)}).status_code == 401


def test_only_host_policy_can_enable_ssh(client, database):
    _, vm_id, _ = database
    assert client.get(f"/vms/{vm_id}/ssh").status_code == 200
    assert client.patch(f"/vms/{vm_id}/ssh",
                        json={"enabled": False}).status_code == 403
    client.app.dependency_overrides[get_current_user] = lambda: UserORM(
        username="host", hashed_password="unused", policies=["vms:ssh:manage"]
    )
    response = client.patch(f"/vms/{vm_id}/ssh", json={"enabled": False})
    assert response.status_code == 200
    assert not response.json()["enabled"]


def test_public_lookup_rejects_ambiguous_or_expired_secrets(database):
    engine, vm_id, credential_id = database
    with Session(engine) as session:
        session.add(VmCredentialORM(
            vm_id=vm_id, name="duplicate", password=encrypt_secret("participant-access-secret")
        ))
        session.commit()
        assert ssh_access.find_credential(
            session, "participant-access-secret") is None
        credential = session.get(VmCredentialORM, credential_id)
        credential.expires_at = datetime.now(
            timezone.utc) - timedelta(seconds=1)
        session.add(credential)
        session.commit()
        assert ssh_access.find_credential(
            session, "participant-access-secret").name == "duplicate"


def test_new_access_secrets_are_strong_and_custom_secrets_must_be_unique(database):
    _, vm_id, _ = database
    generated = vm_service.VmService.create_vm_credential(
        str(vm_id), VmCredentialCreateRequest(name="new")
    )
    assert len(generated["password"]) == 43
    assert ssh_access.authenticate_ssh(
        str(generated["id"]), generated["password"]) == str(vm_id)
    with pytest.raises(HTTPException) as error:
        vm_service.VmService.create_vm_credential(
            str(vm_id), VmCredentialCreateRequest(
                name="duplicate", password="participant-access-secret")
        )
    assert error.value.status_code == 409
