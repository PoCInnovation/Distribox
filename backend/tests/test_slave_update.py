import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.websockets import WebSocketDisconnect

from app.models.slave import SlaveCreate, SlaveHeartbeat
from app.orm.user import UserORM
from app.orm.vm import VmORM
from app.orm.vm_credential import VmCredentialORM
from app.routes import slave as slave_routes, tunnel as tunnel_routes
from app.services import slave_service, ssh_transport, vm_service
from app.services.slave_client import SlaveUnreachableError
from app.services.slave_service import SlaveService
from app.services.vm_service import VmService
from app.utils.auth import get_current_user


@pytest.fixture
def db_engine(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(slave_routes, "engine", engine)
    monkeypatch.setattr(slave_service, "engine", engine)
    monkeypatch.setattr(vm_service, "engine", engine)
    yield engine
    engine.dispose()


def api_client(policies=None, is_admin=False):
    app = FastAPI()
    app.include_router(slave_routes.router, prefix="/slaves")
    app.dependency_overrides[get_current_user] = lambda: UserORM(
        username="user",
        hashed_password="unused",
        policies=list(policies or []),
        is_admin=is_admin,
    )
    return TestClient(app)


def closed_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def start_mock_slave(expected_token: str, vm_id: str):
    vm_payload = {
        "id": vm_id,
        "name": "lab-vm",
        "os": "ubuntu.qcow2",
        "mem": 2,
        "vcpus": 2,
        "disk_size": 20,
        "state": "Running",
        "ipv4": "192.168.122.10",
        "credentials_count": 0,
    }

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def _send_json(self, code: int, payload: object) -> None:
            body = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.headers.get("X-Slave-Token") != expected_token:
                self._send_json(401, {"detail": "Invalid token"})
                return
            if self.path == "/vms":
                self._send_json(200, [vm_payload, {
                    **vm_payload, "id": str(uuid4()), "name": "extra-vm",
                }])
                return
            self._send_json(404, {"detail": "Not found"})

        def do_POST(self):
            if self.headers.get("X-Slave-Token") != expected_token:
                self._send_json(401, {"detail": "Invalid token"})
                return
            if self.path == f"/vms/{vm_id}/start":
                self._send_json(200, vm_payload)
                return
            self._send_json(404, {"detail": "Not found"})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]


def test_edit_slave_preserves_identity_and_routes_operations_to_new_address(
    db_engine,
):
    bad_port = closed_local_port()
    slave = SlaveService.create_slave(
        SlaveCreate(name="wrong-node", hostname="127.0.0.1", port=bad_port)
    )
    SlaveService.handle_heartbeat(
        str(slave.id),
        SlaveHeartbeat(
            total_cpu=8, total_mem=32, total_disk=200,
            available_cpu=90.0, available_mem=28.0, available_disk=180.0,
        ),
    )
    vm_id = uuid4()
    with Session(db_engine) as session:
        session.add(VmORM(
            id=vm_id, name="lab-vm", os="ubuntu.qcow2",
            mem=2, vcpus=2, disk_size=20, slave_id=slave.id,
        ))
        session.add(VmCredentialORM(
            vm_id=vm_id, name="cred-1", password="encrypted",
        ))
        session.commit()

    # Policy & payload validation.
    assert api_client(["slaves:get"]).patch(
        f"/slaves/{slave.id}", json={"name": "fixed-node"}
    ).status_code == 403
    client = api_client(["slaves:create"])
    assert client.patch(
        f"/slaves/{slave.id}", json={"hostname": "127.0.0.1:8081"}
    ).status_code == 422
    assert client.patch(
        f"/slaves/{slave.id}", json={"name": None}
    ).status_code == 422

    # Operations fail at the old address with slave name + address.
    with pytest.raises(SlaveUnreachableError) as before_err:
        VmService.start_vm(str(vm_id))
    assert before_err.value.status_code == 502
    assert "wrong-node" in before_err.value.detail
    assert f"127.0.0.1:{bad_port}" in before_err.value.detail

    # Update address/name in place and verify everything preserves identity.
    server, live_port = start_mock_slave(slave.api_key, str(vm_id))
    try:
        updated = client.patch(
            f"/slaves/{slave.id}",
            json={"name": "fixed-node", "hostname": "127.0.0.1", "port": live_port},
        )
        assert updated.status_code == 200
        body = updated.json()
        assert (body["id"], body["api_key"], body["status"]) == (
            str(slave.id), slave.api_key, "online"
        )
        assert (body["name"], body["hostname"], body["port"]) == (
            "fixed-node", "127.0.0.1", live_port
        )

        # Original API key still authenticates heartbeats and VMs stay attached.
        assert client.post(
            "/slaves/heartbeat",
            headers={"X-Slave-Token": slave.api_key},
            json={
                "total_cpu": 8, "total_mem": 32, "total_disk": 200,
                "available_cpu": 85.0, "available_mem": 26.0, "available_disk": 175.0,
            },
        ).status_code == 200
        with Session(db_engine) as session:
            vm = session.get(VmORM, vm_id)
            assert vm is not None and vm.slave_id == slave.id
            assert len(session.exec(
                select(VmCredentialORM).where(VmCredentialORM.vm_id == vm_id)
            ).all()) == 1

        # Subsequent operations use the updated address and name.
        started = VmService.start_vm(str(vm_id))
        assert started["state"] == "Running"
        assert started["slave_name"] == "fixed-node"
        assert [vm["name"] for vm in SlaveService.list_unmanaged_vms(str(slave.id))] == [
            "extra-vm"
        ]
    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.asyncio
async def test_unreachable_slave_errors_identify_slave_and_address(
    db_engine, monkeypatch
):
    bad_port = closed_local_port()
    slave = SlaveService.create_slave(
        SlaveCreate(name="edge-node", hostname="127.0.0.1", port=bad_port)
    )
    SlaveService.handle_heartbeat(
        str(slave.id),
        SlaveHeartbeat(
            total_cpu=4, total_mem=16, total_disk=100,
            available_cpu=80.0, available_mem=12.0, available_disk=80.0,
        ),
    )
    vm_id = uuid4()
    operator = UserORM(
        username="ops", hashed_password="unused",
        policies=["vms:connect", "slaves:get"],
    )
    with Session(db_engine) as session:
        session.add(VmORM(
            id=vm_id, name="vm-1", os="ubuntu.qcow2",
            mem=2, vcpus=2, disk_size=20, slave_id=slave.id,
        ))
        session.add(operator)
        session.commit()
        operator_id = operator.id

    # SSH prepare preserves unreachable slave detail instead of guest-agent error.
    with pytest.raises(SlaveUnreachableError) as ssh_err:
        await ssh_transport.prepare_guest_connection(str(vm_id), refresh=True)
    assert ssh_err.value.status_code == 502
    assert "edge-node" in ssh_err.value.detail
    assert f"127.0.0.1:{bad_port}" in ssh_err.value.detail

    # Unregister stop failure names the unreachable slave and address.
    with pytest.raises(HTTPException) as del_err:
        SlaveService.delete_slave(str(slave.id))
    assert del_err.value.status_code == 409
    assert "edge-node" in del_err.value.detail
    assert f"127.0.0.1:{bad_port}" in del_err.value.detail

    # /tunnel surfaces the address to authorized operators, generic error to credentials.
    monkeypatch.setattr(tunnel_routes, "engine", db_engine)
    monkeypatch.setattr(tunnel_routes, "_resize_owners", {})
    monkeypatch.setattr(
        tunnel_routes, "_find_vm_for_credential", lambda _: str(vm_id)
    )
    monkeypatch.setattr(
        tunnel_routes, "decode_access_token", lambda _: {"sub": operator_id}
    )
    app = FastAPI()
    app.include_router(tunnel_routes.router)
    with TestClient(app) as client:
        with client.websocket_connect(f"/tunnel?vm_id={vm_id}&token=ops") as ws:
            with pytest.raises(WebSocketDisconnect) as op_closed:
                ws.receive_text()
        with client.websocket_connect("/tunnel?credential=student") as ws:
            with pytest.raises(WebSocketDisconnect) as cred_closed:
                ws.receive_text()

    assert "edge-node" in (op_closed.value.reason or "")
    assert f"127.0.0.1:{bad_port}" in (op_closed.value.reason or "")
    assert cred_closed.value.reason == "Cannot stream the VM desktop"
