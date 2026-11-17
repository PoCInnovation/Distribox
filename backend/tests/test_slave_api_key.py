from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.orm.slave import SlaveORM
from app.orm.user import UserORM
from app.routes import slave
from app.utils.auth import get_current_user

SLAVE = SlaveORM(name="node", hostname="10.0.0.2", port=8081, api_key="key")
READ_POLICIES = ["slaves:get", "slaves:getById"]


def api_client(monkeypatch, policies, is_admin=False):
    monkeypatch.setattr(slave.SlaveService, "list_slaves",
                        Mock(return_value=[SLAVE]))
    monkeypatch.setattr(slave.SlaveService, "get_slave",
                        Mock(return_value=SLAVE))
    monkeypatch.setattr(slave.SlaveService, "create_slave",
                        Mock(return_value=SLAVE))
    app = FastAPI()
    app.include_router(slave.router, prefix="/slaves")
    app.dependency_overrides[get_current_user] = lambda: UserORM(
        username="user", hashed_password="unused", policies=policies,
        is_admin=is_admin,
    )
    return TestClient(app)


@pytest.mark.parametrize(("policies", "is_admin", "sees_key"), [
    (READ_POLICIES, False, False),
    (READ_POLICIES + ["slaves:create"], False, True),
    (READ_POLICIES + ["distribox:admin"], False, True),
    ([], True, True),
])
def test_slave_reads_show_api_key_only_to_node_registrars(
        monkeypatch, policies, is_admin, sees_key):
    client = api_client(monkeypatch, policies, is_admin)
    listed = client.get("/slaves/")
    fetched = client.get(f"/slaves/{SLAVE.id}")
    assert listed.status_code == fetched.status_code == 200
    expected = "key" if sees_key else None
    assert listed.json()[0]["api_key"] == expected
    assert fetched.json()["api_key"] == expected


def test_registering_a_slave_returns_its_api_key(monkeypatch):
    client = api_client(monkeypatch, ["slaves:create"])
    response = client.post("/slaves/", json={
        "name": "node", "hostname": "10.0.0.2", "port": 8081,
    })
    assert response.status_code == 201
    assert response.json()["api_key"] == "key"
