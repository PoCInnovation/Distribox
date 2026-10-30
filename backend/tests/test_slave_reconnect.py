from app.utils.crypto import encrypt_secret
from app.services import event_service, slave_service, vm_service
from app.orm.slave import SlaveORM
from app.orm.vm_credential import VmCredentialORM
from app.orm.vm import VmORM
from app.orm.event import EventORM, EventParticipantORM
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException
import httpx
import pytest
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")


@pytest.fixture
def cluster(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    for module in (event_service, slave_service, vm_service):
        monkeypatch.setattr(module, "engine", engine)
    slave = SlaveORM(name="node", hostname="node", api_key="key")
    master_vm = VmORM(name="master-vm", os="test.qcow2",
                      mem=2, vcpus=1, disk_size=10)
    slave_vms = [
        VmORM(name=f"vm-{index}", os="test.qcow2", mem=2, vcpus=1,
              disk_size=10, ssh_enabled=True, slave_id=slave.id)
        for index in range(2)
    ]
    event = EventORM(
        name="Workshop", slug="workshop", vm_os="test.qcow2", vm_mem=2,
        vm_vcpus=1, vm_disk_size=10, max_vms=2, created_by="host",
        deadline=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    ids = (str(slave.id), master_vm.id,
           [vm.id for vm in slave_vms], event.id)
    with Session(engine) as session:
        session.add_all([slave, master_vm, *slave_vms, event])
        session.add(EventParticipantORM(
            event_id=event.id, vm_id=slave_vms[0].id, participant_name="Ada"))
        for vm in (master_vm, *slave_vms):
            session.add(VmCredentialORM(
                vm_id=vm.id, name="ada", password=encrypt_secret("secret")))
        session.commit()
    yield engine, *ids
    engine.dispose()


def on_slave(vm_ids):
    return [{
        "id": str(vm_id), "name": "vm", "os": "test.qcow2", "mem": 2, "vcpus": 1,
        "disk_size": 10, "keyboard_layout": None, "ssh_enabled": True,
        "state": "Stopped", "ipv4": None, "credentials_count": 0,
    } for vm_id in vm_ids]


def test_unregister_stops_and_forgets_slave_vms_but_keeps_seats(cluster, monkeypatch):
    engine, slave_id, master_vm_id, slave_vm_ids, event_id = cluster
    stopped = []

    def stop(slave, vm_id, force=False):
        stopped.append(vm_id)
        return {"state": "Stopped"}

    monkeypatch.setattr(slave_service, "slave_stop_vm", stop)
    slave_service.SlaveService.delete_slave(slave_id)

    assert sorted(stopped) == sorted(str(vm_id) for vm_id in slave_vm_ids)
    with Session(engine) as session:
        assert session.exec(select(SlaveORM)).all() == []
        assert [vm.id for vm in session.exec(select(VmORM))] == [master_vm_id]
        assert [c.vm_id for c in session.exec(
            select(VmCredentialORM))] == [master_vm_id]
        participant = session.exec(select(EventParticipantORM)).one()
        assert participant.vm_id == slave_vm_ids[0]
    event = event_service.EventService.get_event(str(event_id))
    assert event.participants_count == 1


@pytest.mark.parametrize("failure", [
    httpx.ConnectError("refused"),
    HTTPException(409, "Slave error: VM is paused"),
    {"state": "Running"},
])
def test_unregister_keeps_everything_when_a_vm_does_not_stop(cluster, monkeypatch, failure):
    engine, slave_id, _, slave_vm_ids, _ = cluster

    def stop(slave, vm_id, force=False):
        if vm_id == str(slave_vm_ids[1]):
            if isinstance(failure, Exception):
                raise failure
            return failure
        return {"state": "Stopped"}

    monkeypatch.setattr(slave_service, "slave_stop_vm", stop)
    with pytest.raises(HTTPException) as exc:
        slave_service.SlaveService.delete_slave(slave_id)

    assert exc.value.status_code == 409
    assert "Could not stop 1 of 2 VMs on node" in exc.value.detail
    assert "vm-1" in exc.value.detail
    with Session(engine) as session:
        assert len(session.exec(select(SlaveORM)).all()) == 1
        assert len(session.exec(select(VmORM)).all()) == 3
        assert len(session.exec(select(VmCredentialORM)).all()) == 3


def test_rejoined_slave_vms_are_adopted_once_without_access(cluster, monkeypatch):
    engine, slave_id, master_vm_id, slave_vm_ids, _ = cluster
    monkeypatch.setattr(slave_service, "slave_stop_vm",
                        lambda *args, **kwargs: {"state": "Stopped"})
    slave_service.SlaveService.delete_slave(slave_id)
    with Session(engine) as session:
        rejoined = SlaveORM(name="node", hostname="node", api_key="new-key")
        rejoined_id = str(rejoined.id)
        session.add(rejoined)
        session.commit()
    vms = on_slave([*slave_vm_ids, master_vm_id])
    monkeypatch.setattr(slave_service, "slave_list_vms", lambda slave: vms)
    monkeypatch.setattr(slave_service, "slave_get_vm",
                        lambda slave, vm_id: on_slave([vm_id])[0])

    unmanaged = slave_service.SlaveService.list_unmanaged_vms(rejoined_id)
    assert [vm["id"] for vm in unmanaged] == [
        str(vm_id) for vm_id in slave_vm_ids]

    adopted = slave_service.SlaveService.adopt_vm(
        rejoined_id, str(slave_vm_ids[0]))
    assert adopted["slave_id"] == rejoined_id
    assert adopted["ssh_enabled"] is False
    with pytest.raises(HTTPException) as exc:
        slave_service.SlaveService.adopt_vm(rejoined_id, str(slave_vm_ids[0]))
    assert exc.value.status_code == 409
    with Session(engine) as session:
        vm = session.get(VmORM, slave_vm_ids[0])
        assert str(vm.slave_id) == rejoined_id and not vm.ssh_enabled
        assert session.exec(select(VmCredentialORM).where(
            VmCredentialORM.vm_id == vm.id)).all() == []
    assert [vm["id"] for vm in slave_service.SlaveService.list_unmanaged_vms(
        rejoined_id)] == [str(slave_vm_ids[1])]
