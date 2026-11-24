import threading
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
from app.services import slave_client, slave_service, vm_service
from app.services.slave_client import SlaveUnreachableError
from app.utils import vm as vm_utils
from app.utils.auth import get_current_user


def _libvirt_error(message: str, code: int) -> libvirt.libvirtError:
    err = libvirt.libvirtError(message)
    err.err = (code, 0, message, 2, None, None, None, 0, 0)
    return err


@pytest.fixture
def running_vm(tmp_path, monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(vm_service, "engine", engine)
    monkeypatch.setattr(slave_service, "engine", engine)
    monkeypatch.setattr(vm_service, "VMS_DIR", tmp_path)
    monkeypatch.setattr(vm_service, "get_vm_ip", lambda _: "192.168.122.42")
    monkeypatch.setattr(vm_service, "ensure_default_network", Mock())
    monkeypatch.setattr(vm_service, "ensure_seed_iso", Mock())
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
    domain = Mock()
    domain.isActive.return_value = 1
    domain.state.return_value = (libvirt.VIR_DOMAIN_RUNNING, 0)
    domain.hasManagedSaveImage.return_value = 0
    domain.XMLDesc.return_value = "<domain><devices/></domain>"
    domain.destroy.side_effect = lambda: (
        setattr(domain.state, "return_value", (libvirt.VIR_DOMAIN_SHUTOFF, 0)),
        setattr(domain.isActive, "return_value", 0),
    )
    domain.create.side_effect = lambda: (
        setattr(domain.state, "return_value", (libvirt.VIR_DOMAIN_RUNNING, 0)),
        setattr(domain.isActive, "return_value", 1),
    )
    connection = Mock()
    connection.lookupByName.return_value = domain
    monkeypatch.setattr(vm_service.QEMUConfig,
                        "get_connection", lambda: connection)
    yield vm_id, domain, engine
    engine.dispose()


def _attach_slave_app(monkeypatch, slave_engine, slave_domain, token="slave-secret"):
    """Route slave_client's real httpx decoding through a live slave_agent app."""
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
            # Slaves run in their own process and do not share master power-op state.
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


def _master_api_client():
    app = FastAPI()
    app.add_exception_handler(HTTPException, main.http_exception_handler)
    app.include_router(vm_routes.router, prefix="/vms")
    app.dependency_overrides[get_current_user] = lambda: UserORM(
        username="ops",
        hashed_password="unused",
        policies=["vms:start", "vms:stop"],
    )
    return TestClient(app)


def test_shutdown_timeout_raises_clear_error_and_code_when_vm_stays_running(running_vm):
    vm_id, domain, _ = running_vm
    # Guest ignores ACPI shutdown: state remains VIR_DOMAIN_RUNNING.
    response = _master_api_client().post(f"/vms/{vm_id}/stop")
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == VM_SHUTDOWN_FAILED_CODE
    assert "did not shut down in time" in body["detail"]
    assert "still running" in body["detail"]
    assert "Force stop" in body["detail"]
    domain.shutdown.assert_called_once()
    domain.destroy.assert_not_called()


def test_shutdown_timeout_reports_still_stopping_state(running_vm):
    vm_id, domain, _ = running_vm
    domain.shutdown.side_effect = lambda: setattr(
        domain.state, "return_value", (libvirt.VIR_DOMAIN_SHUTDOWN, 0)
    )
    with pytest.raises(CodedHTTPException) as err:
        vm_service.VmService.stop_vm(vm_id)
    assert err.value.status_code == 409
    assert err.value.code == VM_SHUTDOWN_FAILED_CODE
    assert "still stopping" in err.value.detail
    assert "Force stop" in err.value.detail


def test_force_stop_destroys_running_vm(running_vm):
    vm_id, domain, _ = running_vm
    result = vm_service.VmService.stop_vm(vm_id, force=True)
    assert result.state == "Stopped"
    assert result.ipv4 is None
    domain.destroy.assert_called_once()
    domain.shutdown.assert_not_called()


def test_force_stop_timeout_does_not_suggest_force_stop_again(running_vm):
    vm_id, domain, _ = running_vm
    domain.destroy.side_effect = None
    with pytest.raises(HTTPException) as err:
        vm_service.VmService.stop_vm(vm_id, force=True)
    assert err.value.status_code == 409
    assert getattr(err.value, "code", None) is None
    assert "Could not force stop" in err.value.detail
    assert "Use Force stop" not in err.value.detail


def test_restart_fails_without_starting_when_shutdown_times_out(running_vm):
    vm_id, domain, _ = running_vm
    response = _master_api_client().post(f"/vms/{vm_id}/restart")
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == VM_SHUTDOWN_FAILED_CODE
    assert "Could not restart" in body["detail"]
    assert "did not shut down in time" in body["detail"]
    assert "Force stop" in body["detail"]
    domain.shutdown.assert_called_once()
    domain.create.assert_not_called()
    domain.resume.assert_not_called()


def test_restart_succeeds_when_shutdown_completes(running_vm):
    vm_id, domain, _ = running_vm
    domain.shutdown.side_effect = lambda: (
        setattr(domain.state, "return_value", (libvirt.VIR_DOMAIN_SHUTOFF, 0)),
        setattr(domain.isActive, "return_value", 0),
    )
    result = vm_service.VmService.restart_vm(vm_id)
    assert result.state == "Running"
    domain.shutdown.assert_called_once()
    domain.create.assert_called_once()


def test_stop_succeeds_if_vm_stops_during_shutdown_race(running_vm):
    vm_id, domain, _ = running_vm

    def already_off():
        domain.isActive.return_value = 0
        domain.state.return_value = (libvirt.VIR_DOMAIN_SHUTOFF, 0)
        raise _libvirt_error(
            "domain is not running", libvirt.VIR_ERR_OPERATION_INVALID
        )

    domain.shutdown.side_effect = already_off
    result = vm_service.VmService.stop_vm(vm_id)
    assert result.state == "Stopped"


def test_stop_operation_invalid_while_still_active_raises_409_with_code(running_vm):
    vm_id, domain, _ = running_vm
    domain.shutdown.side_effect = _libvirt_error(
        "operation invalid for current state",
        libvirt.VIR_ERR_OPERATION_INVALID,
    )
    with pytest.raises(CodedHTTPException) as err:
        vm_service.VmService.stop_vm(vm_id)
    assert err.value.status_code == 409
    assert err.value.code == VM_SHUTDOWN_FAILED_CODE
    assert "Force stop" in err.value.detail


def test_stop_wait_for_state_libvirt_errors_map_to_404_and_409(running_vm, monkeypatch):
    vm_id, domain, _ = running_vm

    monkeypatch.setattr(
        vm_service,
        "wait_for_state",
        Mock(side_effect=_libvirt_error("domain vanished", libvirt.VIR_ERR_NO_DOMAIN)),
    )
    with pytest.raises(HTTPException) as not_found:
        vm_service.VmService.stop_vm(vm_id)
    assert not_found.value.status_code == 404

    monkeypatch.setattr(
        vm_service,
        "wait_for_state",
        Mock(side_effect=_libvirt_error("connection dropped", libvirt.VIR_ERR_INTERNAL_ERROR)),
    )
    with pytest.raises(CodedHTTPException) as conflict:
        vm_service.VmService.stop_vm(vm_id)
    assert conflict.value.status_code == 409
    assert conflict.value.code == VM_SHUTDOWN_FAILED_CODE


def test_wait_for_state_checks_after_last_sleep(monkeypatch):
    monkeypatch.setattr(vm_utils, "sleep", lambda _: None)
    vm = Mock()
    vm.state.side_effect = [
        (libvirt.VIR_DOMAIN_RUNNING, 0),
        (libvirt.VIR_DOMAIN_RUNNING, 0),
        (libvirt.VIR_DOMAIN_SHUTOFF, 0),
    ]
    assert vm_utils.wait_for_state(
        vm, libvirt.VIR_DOMAIN_SHUTOFF, 0.1, 2
    ) == libvirt.VIR_DOMAIN_SHUTOFF
    assert vm.state.call_count == 3

    vm_zero = Mock()
    vm_zero.state.return_value = (libvirt.VIR_DOMAIN_RUNNING, 0)
    assert vm_utils.wait_for_state(
        vm_zero, libvirt.VIR_DOMAIN_SHUTOFF, 0.1, 0
    ) == libvirt.VIR_DOMAIN_RUNNING


def test_local_and_slave_vm_stop_restart_and_pause_behave_consistently(
    running_vm, monkeypatch
):
    local_vm_id, local_domain, master_engine = running_vm

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
        slave_id = str(slave.id)
        slave_vm_uuid = uuid4()
        slave_vm_id = str(slave_vm_uuid)
        with Session(master_engine) as session:
            session.add(slave)
            session.add(VmORM(
                id=slave_vm_uuid,
                name="Slave Lab",
                os="lab.qcow2",
                mem=4,
                vcpus=2,
                disk_size=20,
                slave_id=slave.id,
            ))
            session.commit()
        with Session(slave_engine) as session:
            session.add(VmORM(
                id=slave_vm_uuid,
                name="Slave Lab",
                os="lab.qcow2",
                mem=4,
                vcpus=2,
                disk_size=20,
            ))
            session.commit()

        slave_domain = Mock()
        slave_domain.isActive.return_value = 1
        slave_domain.state.return_value = (libvirt.VIR_DOMAIN_RUNNING, 0)
        slave_domain.destroy.side_effect = lambda: (
            setattr(slave_domain.state, "return_value",
                    (libvirt.VIR_DOMAIN_SHUTOFF, 0)),
            setattr(slave_domain.isActive, "return_value", 0),
        )
        _attach_slave_app(monkeypatch, slave_engine, slave_domain)

        # 1. Shutdown timeout matches identically (status, detail, code).
        with pytest.raises(CodedHTTPException) as local_stop_err:
            vm_service.VmService.stop_vm(local_vm_id)
        with pytest.raises(CodedHTTPException) as slave_stop_err:
            vm_service.VmService.stop_vm(slave_vm_id)
        assert slave_stop_err.value.status_code == local_stop_err.value.status_code == 409
        assert slave_stop_err.value.detail == local_stop_err.value.detail
        assert slave_stop_err.value.code == local_stop_err.value.code == VM_SHUTDOWN_FAILED_CODE

        # 2. Restart failure matches identically and never starts the slave VM.
        with pytest.raises(CodedHTTPException) as local_restart_err:
            vm_service.VmService.restart_vm(local_vm_id)
        with pytest.raises(CodedHTTPException) as slave_restart_err:
            vm_service.VmService.restart_vm(slave_vm_id)
        assert slave_restart_err.value.status_code == local_restart_err.value.status_code == 409
        assert slave_restart_err.value.detail == local_restart_err.value.detail
        assert slave_restart_err.value.code == local_restart_err.value.code == VM_SHUTDOWN_FAILED_CODE
        slave_domain.create.assert_not_called()

        # 3. Slave unregister reports the clean timeout without a "Slave error:" prefix.
        with pytest.raises(HTTPException) as unregister_err:
            slave_service.SlaveService.delete_slave(slave_id)
        assert unregister_err.value.status_code == 409
        assert "Slave Lab: The VM did not shut down in time" in unregister_err.value.detail
        assert "Slave error:" not in unregister_err.value.detail

        # 4. Paused VM restart fails identically without code and never resumes/starts.
        local_domain.state.return_value = (
            libvirt.VIR_DOMAIN_PAUSED, libvirt.VIR_DOMAIN_PAUSED_USER
        )
        slave_domain.state.return_value = (
            libvirt.VIR_DOMAIN_PAUSED, libvirt.VIR_DOMAIN_PAUSED_USER
        )
        with pytest.raises(HTTPException) as local_paused_restart:
            vm_service.VmService.restart_vm(local_vm_id)
        with pytest.raises(HTTPException) as slave_paused_restart:
            vm_service.VmService.restart_vm(slave_vm_id)
        assert local_paused_restart.value.status_code == slave_paused_restart.value.status_code == 409
        assert local_paused_restart.value.detail == slave_paused_restart.value.detail
        assert getattr(local_paused_restart.value, "code", None) is None
        assert getattr(slave_paused_restart.value, "code", None) is None
        local_domain.resume.assert_not_called()
        slave_domain.resume.assert_not_called()

        # 5. Force stop powers off both paused and running VMs cleanly.
        assert vm_service.VmService.stop_vm(local_vm_id, force=True).state == "Stopped"
        stopped_paused_slave = vm_service.VmService.stop_vm(slave_vm_id, force=True)
        assert stopped_paused_slave["state"] == "Stopped"
        assert stopped_paused_slave["slave_name"] == "gpu-node"

        # Reset slave VM to running and confirm force stop destroys it too.
        slave_domain.state.return_value = (libvirt.VIR_DOMAIN_RUNNING, 0)
        slave_domain.isActive.return_value = 1
        stopped_running_slave = vm_service.VmService.stop_vm(slave_vm_id, force=True)
        assert stopped_running_slave["state"] == "Stopped"
        assert slave_domain.destroy.call_count == 2
    finally:
        slave_engine.dispose()


def test_master_rejects_legacy_slave_returning_running_state_on_stop_force_and_restart(
    running_vm, monkeypatch
):
    _, _, master_engine = running_vm
    slave = SlaveORM(
        name="legacy-node",
        hostname="127.0.0.1",
        port=8081,
        api_key="legacy-secret",
        status="online",
    )
    vm_uuid = uuid4()
    vm_id = str(vm_uuid)
    with Session(master_engine) as session:
        session.add(slave)
        session.add(VmORM(
            id=vm_uuid, name="Legacy VM", os="lab.qcow2",
            mem=2, vcpus=1, disk_size=10, slave_id=slave.id,
        ))
        session.commit()

    monkeypatch.setattr(
        slave_client,
        "slave_stop_vm",
        lambda *args, **kwargs: {"id": vm_id, "state": "Running"},
    )
    start_mock = Mock()
    monkeypatch.setattr(slave_client, "slave_start_vm", start_mock)

    with pytest.raises(CodedHTTPException) as stop_err:
        vm_service.VmService.stop_vm(vm_id)
    assert stop_err.value.status_code == 409
    assert stop_err.value.code == VM_SHUTDOWN_FAILED_CODE
    assert "did not shut down in time" in stop_err.value.detail

    with pytest.raises(HTTPException) as force_err:
        vm_service.VmService.stop_vm(vm_id, force=True)
    assert force_err.value.status_code == 409
    assert getattr(force_err.value, "code", None) is None
    assert "up to date" in force_err.value.detail

    with pytest.raises(CodedHTTPException) as restart_err:
        vm_service.VmService.restart_vm(vm_id)
    assert restart_err.value.status_code == 409
    assert restart_err.value.code == VM_SHUTDOWN_FAILED_CODE
    assert "Could not restart" in restart_err.value.detail
    start_mock.assert_not_called()


def test_restart_preserves_slave_unreachable_error(running_vm, monkeypatch):
    _, _, master_engine = running_vm
    slave = SlaveORM(
        name="down-node",
        hostname="127.0.0.1",
        port=8089,
        api_key="secret",
        status="online",
    )
    vm_uuid = uuid4()
    vm_id = str(vm_uuid)
    with Session(master_engine) as session:
        session.add(slave)
        session.add(VmORM(
            id=vm_uuid, name="Down VM", os="lab.qcow2",
            mem=2, vcpus=1, disk_size=10, slave_id=slave.id,
        ))
        session.commit()

    def raise_unreachable(*args, **kwargs):
        raise SlaveUnreachableError(
            502,
            "Cannot reach slave 'down-node' at 127.0.0.1:8089: connection refused",
            slave_name="down-node",
            address="127.0.0.1:8089",
        )

    monkeypatch.setattr(slave_client, "slave_stop_vm", raise_unreachable)
    with pytest.raises(SlaveUnreachableError) as err:
        vm_service.VmService.restart_vm(vm_id)
    assert err.value.status_code == 502
    assert "down-node" in err.value.detail


def test_stop_and_force_stop_skip_guest_agent_ip_probe(running_vm, monkeypatch):
    vm_id, domain, _ = running_vm
    monkeypatch.setattr(
        vm_service,
        "get_vm_ip",
        Mock(side_effect=AssertionError("stop must not probe guest IP")),
    )
    with pytest.raises(CodedHTTPException):
        vm_service.VmService.stop_vm(vm_id, force=False)
    result = vm_service.VmService.stop_vm(vm_id, force=True)
    assert result.state == "Stopped"
    assert result.ipv4 is None
    domain.destroy.assert_called_once()


def test_force_stop_rejected_during_active_restart_but_allowed_during_stop(
    running_vm, monkeypatch
):
    vm_id, domain, _ = running_vm
    in_wait = threading.Event()
    release_wait = threading.Event()

    def blocking_wait(vm, state_code, *args):
        if state_code == libvirt.VIR_DOMAIN_SHUTOFF and vm.state()[0] != state_code:
            in_wait.set()
            release_wait.wait(timeout=5)
        return vm.state()[0]

    monkeypatch.setattr(vm_service, "wait_for_state", blocking_wait)

    # 1. Concurrent force stop during Restart is rejected so Restart cannot
    #    observe shutoff and immediately power the VM back on.
    restart_error: list[Exception] = []

    def run_restart():
        try:
            vm_service.VmService.restart_vm(vm_id)
        except Exception as exc:
            restart_error.append(exc)

    restart_thread = threading.Thread(target=run_restart)
    restart_thread.start()
    assert in_wait.wait(timeout=5)
    try:
        with pytest.raises(HTTPException) as conflict:
            vm_service.VmService.stop_vm(vm_id, force=True)
        assert conflict.value.status_code == 409
        assert "restarting" in conflict.value.detail
        domain.destroy.assert_not_called()
    finally:
        release_wait.set()
        restart_thread.join(timeout=5)
    assert len(restart_error) == 1
    assert isinstance(restart_error[0], CodedHTTPException)
    domain.create.assert_not_called()

    # 2. Force stop escalating an ordinary Stop IS allowed and succeeds.
    in_wait.clear()
    release_wait.clear()
    stop_results: list[object] = []

    def run_stop():
        stop_results.append(vm_service.VmService.stop_vm(vm_id, force=False))

    stop_thread = threading.Thread(target=run_stop)
    stop_thread.start()
    assert in_wait.wait(timeout=5)
    try:
        forced = vm_service.VmService.stop_vm(vm_id, force=True)
        assert forced.state == "Stopped"
        domain.destroy.assert_called_once()
    finally:
        release_wait.set()
        stop_thread.join(timeout=5)
    assert len(stop_results) == 1
    assert getattr(stop_results[0], "state", None) == "Stopped"

    # 3. Reverse ordering: concurrent Restart while Force stop is in flight is
    #    rejected atomically so Restart cannot observe shutoff and power it back on.
    domain.state.return_value = (libvirt.VIR_DOMAIN_RUNNING, 0)
    domain.isActive.return_value = 1
    domain.create.reset_mock()
    destroy_entered = threading.Event()
    release_destroy = threading.Event()

    def slow_destroy():
        destroy_entered.set()
        release_destroy.wait(timeout=5)
        domain.state.return_value = (libvirt.VIR_DOMAIN_SHUTOFF, 0)
        domain.isActive.return_value = 0

    domain.destroy.side_effect = slow_destroy
    force_results: list[object] = []

    def run_force_stop():
        force_results.append(vm_service.VmService.stop_vm(vm_id, force=True))

    force_thread = threading.Thread(target=run_force_stop)
    force_thread.start()
    assert destroy_entered.wait(timeout=5)
    try:
        with pytest.raises(HTTPException) as restart_conflict:
            vm_service.VmService.restart_vm(vm_id)
        assert restart_conflict.value.status_code == 409
        assert "stopping" in restart_conflict.value.detail
        domain.create.assert_not_called()
    finally:
        release_destroy.set()
        force_thread.join(timeout=5)
    assert len(force_results) == 1
    assert getattr(force_results[0], "state", None) == "Stopped"


def test_restart_releases_guard_before_guest_ip_probe(running_vm, monkeypatch):
    vm_id, domain, _ = running_vm
    domain.shutdown.side_effect = lambda: (
        setattr(domain.state, "return_value", (libvirt.VIR_DOMAIN_SHUTOFF, 0)),
        setattr(domain.isActive, "return_value", 0),
    )
    in_ip_probe = threading.Event()
    release_ip_probe = threading.Event()

    def slow_ip_probe(_vm_id: str):
        in_ip_probe.set()
        release_ip_probe.wait(timeout=5)
        return "192.168.122.42"

    monkeypatch.setattr(vm_service, "get_vm_ip", slow_ip_probe)

    restart_results: list[object] = []

    def run_restart():
        restart_results.append(vm_service.VmService.restart_vm(vm_id))

    restart_thread = threading.Thread(target=run_restart)
    restart_thread.start()
    assert in_ip_probe.wait(timeout=5)
    try:
        # Once start() verified RUNNING, Force stop must not stay blocked by a slow IP probe.
        stopped = vm_service.VmService.stop_vm(vm_id, force=True)
        assert stopped.state == "Stopped"
        domain.destroy.assert_called_once()
    finally:
        release_ip_probe.set()
        restart_thread.join(timeout=5)
    assert len(restart_results) == 1
