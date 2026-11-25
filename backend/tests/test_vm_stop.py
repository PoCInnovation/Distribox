from unittest.mock import Mock
from urllib.parse import urlsplit
from uuid import uuid4

import libvirt
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import main
from app.core.exceptions import CodedHTTPException, VM_SHUTDOWN_FAILED_CODE
from app.orm.slave import SlaveORM
from app.orm.user import UserORM
from app.orm.vm import VmORM
from app.routes import slave_agent, vm as vm_routes
from app.services import slave_client, vm_service
from app.utils.auth import get_current_user


def _make_running_domain() -> Mock:
    domain = Mock()
    domain.isActive.return_value = 1
    domain.state.return_value = (libvirt.VIR_DOMAIN_RUNNING, 0)
    domain.hasManagedSaveImage.return_value = 0
    domain.XMLDesc.return_value = "<domain><devices/></domain>"
    domain.destroy.side_effect = lambda: (
        setattr(domain.state, "return_value", (libvirt.VIR_DOMAIN_SHUTOFF, 0)),
        setattr(domain.isActive, "return_value", 0),
    )
    return domain


@pytest.fixture
def running_vm(tmp_path, monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(vm_service, "engine", engine)
    monkeypatch.setattr(vm_service, "VMS_DIR", tmp_path)
    monkeypatch.setattr(vm_service, "get_vm_ip", lambda _: "192.168.122.42")
    monkeypatch.setattr(vm_service, "wait_for_state",
                        lambda vm, *args: vm.state()[0])
    record = VmORM(
        name="Unresponsive Lab", os="lab.qcow2", mem=4, vcpus=2, disk_size=20,
    )
    with Session(engine) as session:
        session.add(record)
        session.commit()
        vm_id = str(record.id)
    (tmp_path / vm_id).mkdir()
    domain = _make_running_domain()
    connection = Mock()
    connection.lookupByName.return_value = domain
    monkeypatch.setattr(vm_service.QEMUConfig,
                        "get_connection", lambda: connection)
    yield vm_id, domain, engine
    engine.dispose()


def _attach_slave_app(monkeypatch, slave_engine, slave_domain, token="slave-secret"):
    monkeypatch.setattr(slave_agent, "SLAVE_API_KEY", token)
    monkeypatch.setattr("app.utils.slave_auth.SLAVE_API_KEY", token)
    app = FastAPI()
    app.add_exception_handler(HTTPException, main.http_exception_handler)
    app.include_router(slave_agent.router)
    slave_test_client = TestClient(app)

    connection = Mock()
    connection.lookupByName.return_value = slave_domain

    class _InProcessSlaveClient:
        def __init__(self, timeout=None):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def request(self, method, url, headers=None, json=None):
            parsed = urlsplit(url)
            path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
            orig_engine = vm_service.engine
            orig_conn = vm_service.QEMUConfig.get_connection
            orig_restarting = vm_service._restarting_vms
            orig_stopping = vm_service._stopping_vms
            vm_service.engine = slave_engine
            vm_service.QEMUConfig.get_connection = lambda: connection
            vm_service._restarting_vms = set()
            vm_service._stopping_vms = {}
            try:
                return slave_test_client.request(
                    method, path, headers=headers, json=json,
                )
            finally:
                vm_service.engine = orig_engine
                vm_service.QEMUConfig.get_connection = orig_conn
                vm_service._restarting_vms = orig_restarting
                vm_service._stopping_vms = orig_stopping

    monkeypatch.setattr(slave_client.httpx, "Client", _InProcessSlaveClient)


def test_local_shutdown_timeout_restart_and_force_stop(running_vm):
    vm_id, domain, _ = running_vm
    app = FastAPI()
    app.add_exception_handler(HTTPException, main.http_exception_handler)
    app.include_router(vm_routes.router, prefix="/vms")
    app.dependency_overrides[get_current_user] = lambda: UserORM(
        username="ops",
        hashed_password="unused",
        policies=["vms:start", "vms:stop"],
    )
    client = TestClient(app)

    stop_res = client.post(f"/vms/{vm_id}/stop")
    assert stop_res.status_code == 409
    assert stop_res.json()["code"] == VM_SHUTDOWN_FAILED_CODE
    assert "did not shut down in time" in stop_res.json()["detail"]
    domain.destroy.assert_not_called()

    restart_res = client.post(f"/vms/{vm_id}/restart")
    assert restart_res.status_code == 409
    assert restart_res.json()["code"] == VM_SHUTDOWN_FAILED_CODE
    assert "Could not restart" in restart_res.json()["detail"]
    domain.create.assert_not_called()

    force_res = client.post(f"/vms/{vm_id}/stop?force=true")
    assert force_res.status_code == 200
    assert force_res.json()["state"] == "Stopped"
    domain.destroy.assert_called_once()


def test_slave_shutdown_timeout_restart_and_force_stop_match_local(
    running_vm, monkeypatch
):
    local_vm_id, _, master_engine = running_vm
    slave_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(slave_engine)
    try:
        slave = SlaveORM(
            name="gpu-node",
            hostname="127.0.0.1",
            port=8081,
            api_key="slave-secret",
            status="online",
        )
        slave_vm_uuid = uuid4()
        slave_vm_id = str(slave_vm_uuid)
        with Session(master_engine) as session:
            session.add(slave)
            session.add(VmORM(
                id=slave_vm_uuid, name="Slave Lab", os="lab.qcow2",
                mem=4, vcpus=2, disk_size=20, slave_id=slave.id,
            ))
            session.commit()
        with Session(slave_engine) as session:
            session.add(VmORM(
                id=slave_vm_uuid, name="Slave Lab", os="lab.qcow2",
                mem=4, vcpus=2, disk_size=20,
            ))
            session.commit()

        slave_domain = _make_running_domain()
        _attach_slave_app(monkeypatch, slave_engine, slave_domain)

        with pytest.raises(CodedHTTPException) as local_stop:
            vm_service.VmService.stop_vm(local_vm_id)
        with pytest.raises(CodedHTTPException) as slave_stop:
            vm_service.VmService.stop_vm(slave_vm_id)
        assert slave_stop.value.status_code == local_stop.value.status_code == 409
        assert slave_stop.value.code == local_stop.value.code == VM_SHUTDOWN_FAILED_CODE
        assert slave_stop.value.detail == local_stop.value.detail

        with pytest.raises(CodedHTTPException) as local_restart:
            vm_service.VmService.restart_vm(local_vm_id)
        with pytest.raises(CodedHTTPException) as slave_restart:
            vm_service.VmService.restart_vm(slave_vm_id)
        assert slave_restart.value.status_code == local_restart.value.status_code == 409
        assert slave_restart.value.code == local_restart.value.code == VM_SHUTDOWN_FAILED_CODE
        assert slave_restart.value.detail == local_restart.value.detail
        slave_domain.create.assert_not_called()

        stopped = vm_service.VmService.stop_vm(slave_vm_id, force=True)
        assert stopped["state"] == "Stopped"
        assert stopped["slave_name"] == "gpu-node"
        slave_domain.destroy.assert_called_once()
    finally:
        slave_engine.dispose()
