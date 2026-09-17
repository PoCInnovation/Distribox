from app.utils.crypto import encrypt_secret
from app.services import event_service, ssh_access
from app.orm.vm_credential import VmCredentialORM
from app.orm.vm import VmORM
from app.orm.event import EventORM, EventParticipantORM
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException
import pytest
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")


@pytest.fixture
def workshop(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(event_service, "engine", engine)
    monkeypatch.setattr(ssh_access, "engine", engine)
    deadline = datetime.now(timezone.utc) + timedelta(hours=1)
    event = EventORM(
        name="Workshop", slug="workshop", vm_os="test.qcow2", vm_mem=2,
        vm_vcpus=1, vm_disk_size=10, max_vms=2, deadline=deadline,
        created_by="host", ssh_enabled=True,
    )
    event_id = event.id
    vm_ids = []
    credentials = {}
    with Session(engine) as session:
        session.add(event)
        for index in range(3):
            vm = VmORM(name=f"VM {index}", os="test.qcow2", mem=2, vcpus=1,
                       disk_size=10, ssh_enabled=True)
            session.add(vm)
            vm_ids.append(vm.id)
            credentials[vm.id] = []
            for expires_at in (None, deadline):
                credential = VmCredentialORM(
                    vm_id=vm.id, name="participant", expires_at=expires_at,
                    password=encrypt_secret("test-access-secret"),
                )
                session.add(credential)
                credentials[vm.id].append(credential.id)
            if index < 2:
                session.add(EventParticipantORM(
                    event_id=event.id, vm_id=vm.id, participant_name=f"Person {index}",
                ))
        session.commit()
    yield engine, event_id, vm_ids, credentials
    engine.dispose()


@pytest.mark.parametrize("action", ["event", "participant"])
@pytest.mark.parametrize("failure", [HTTPException(409, "Host offline"), TimeoutError()])
def test_removal_revokes_access_before_trying_to_delete_vm(workshop, monkeypatch, action, failure):
    engine, event_id, vm_ids, credentials = workshop
    removed = vm_ids[:2] if action == "event" else vm_ids[:1]
    attempted = []

    def remove_vm(vm_id):
        attempted.append(vm_id)
        with Session(engine) as session:
            for removed_id in removed:
                assert not session.get(VmORM, removed_id).ssh_enabled
                assert not session.exec(select(VmCredentialORM).where(
                    VmCredentialORM.vm_id == removed_id,
                )).all()
        raise failure

    monkeypatch.setattr(event_service.VmService, "remove_vm", remove_vm)
    if action == "event":
        event_service.EventService.delete_event(str(event_id))
    else:
        event_service.EventService.delete_event_vm(
            str(event_id), str(vm_ids[0]))

    assert set(attempted) == {str(vm_id) for vm_id in removed}
    with Session(engine) as session:
        assert (session.get(EventORM, event_id) is None) == (action == "event")
        for vm_id in vm_ids:
            assert session.get(VmORM, vm_id).ssh_enabled == (
                vm_id not in removed)
            for credential_id in credentials[vm_id]:
                assert (session.get(VmCredentialORM, credential_id)
                        is None) == (vm_id in removed)
                assert ssh_access.ssh_access_valid(
                    str(credential_id), str(vm_id)) == (vm_id not in removed)


def test_unknown_participant_does_not_revoke_an_unrelated_vm(workshop):
    engine, event_id, vm_ids, credentials = workshop
    with pytest.raises(HTTPException) as failure:
        event_service.EventService.delete_event_vm(
            str(event_id), str(vm_ids[2]))
    assert failure.value.status_code == 404
    for vm_id in vm_ids:
        for credential_id in credentials[vm_id]:
            assert ssh_access.ssh_access_valid(str(credential_id), str(vm_id))
