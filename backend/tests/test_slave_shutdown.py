import asyncio
from unittest.mock import AsyncMock, MagicMock, Mock
from uuid import uuid4

import libvirt
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import main
from app.core import config
from app.orm.slave import SlaveORM
from app.orm.vm import VmORM

MASTER_URL = "http://master.test"


def domain(name, active=1):
    result = Mock()
    result.name.return_value = name
    result.isActive.return_value = active
    return result


def add_vm(engine, slave_id=None):
    vm_id = uuid4()
    with Session(engine) as session:
        session.add(VmORM(id=vm_id, name="vm", os="os.qcow2", mem=1, vcpus=1,
                          disk_size=1, slave_id=slave_id))
        session.commit()
    return str(vm_id)


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    yield engine
    engine.dispose()


@pytest.fixture
def slave(monkeypatch, engine):
    connection = Mock()
    client = MagicMock()
    client.__aenter__.return_value.post = AsyncMock()
    monkeypatch.setattr(main, "DISTRIBOX_MODE", "slave")
    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.setattr(main.QEMUConfig, "get_connection", lambda: connection)
    monkeypatch.setattr(config, "MASTER_URL", MASTER_URL)
    monkeypatch.setattr(config, "SLAVE_API_KEY", "token")
    monkeypatch.setattr("httpx.AsyncClient", lambda **_: client)
    return Mock(connection=connection,
                notify_master=client.__aenter__.return_value.post)


def shut_down():
    asyncio.run(main.shutdown_event())


def test_shutdown_stops_only_locally_managed_vms(slave, engine):
    SQLModel.metadata.create_all(engine)
    other_slave = SlaveORM(name="other", hostname="other", api_key="key")
    other_slave_id = other_slave.id
    with Session(engine) as session:
        session.add(other_slave)
        session.commit()
    managed = domain(add_vm(engine))
    managed_stopped = domain(add_vm(engine), active=0)
    unrelated = domain("personal-vm")
    unrelated_uuid_name = domain(str(uuid4()))
    on_other_slave = domain(add_vm(engine, slave_id=other_slave_id))
    slave.connection.listAllDomains.return_value = [
        managed, managed_stopped, unrelated, unrelated_uuid_name,
        on_other_slave,
    ]

    shut_down()

    managed.destroy.assert_called_once_with()
    for other in (managed_stopped, unrelated, unrelated_uuid_name,
                  on_other_slave):
        other.destroy.assert_not_called()
    slave.notify_master.assert_awaited_once()


def test_failed_ownership_lookup_stops_nothing(slave, engine):
    # No tables: the query itself fails, as it would with the database down.
    unrelated = domain("personal-vm")
    slave.connection.listAllDomains.return_value = [unrelated]

    shut_down()

    unrelated.destroy.assert_not_called()
    slave.notify_master.assert_awaited_once()


def test_failed_destroy_does_not_skip_other_managed_vms(slave, engine):
    SQLModel.metadata.create_all(engine)
    failing = domain(add_vm(engine))
    failing.destroy.side_effect = libvirt.libvirtError("destroy failed")
    managed = domain(add_vm(engine))
    slave.connection.listAllDomains.return_value = [failing, managed]

    shut_down()

    managed.destroy.assert_called_once_with()
    slave.notify_master.assert_awaited_once()


def test_failed_domain_listing_still_notifies_master(slave, engine):
    SQLModel.metadata.create_all(engine)
    slave.connection.listAllDomains.side_effect = libvirt.libvirtError(
        "libvirt unavailable")

    shut_down()

    slave.notify_master.assert_awaited_once()


def test_master_shutdown_stops_nothing(slave, engine, monkeypatch):
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(main, "DISTRIBOX_MODE", "master")
    managed = domain(add_vm(engine))
    slave.connection.listAllDomains.return_value = [managed]

    shut_down()

    managed.destroy.assert_not_called()
    slave.notify_master.assert_not_awaited()
