"""Storage administration must honor delegated policies on every host."""
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.orm.user import UserORM
from app.routes import host, slave_agent
from app.services import slave_client
from app.services.storage_management import StorageManagementService
from app.utils import slave_auth
from app.utils.auth import get_current_user


SETTINGS = {"locations": [], "candidates": [], "discovery_error": None}
OPERATIONS = [
    ("GET", "/host/storage/settings", None, "settings"),
    ("POST", "/host/storage/locations",
     {"mount_id": "mount-data", "name": "Data"}, "add"),
    ("PATCH", "/host/storage/locations/data",
     {"enabled": False}, "update"),
]


def api_client(policies=(), *, is_admin=False, authenticated=True):
    app = FastAPI()
    app.include_router(host.router, prefix="/host")
    if authenticated:
        app.dependency_overrides[get_current_user] = lambda: UserORM(
            username="storage-operator", hashed_password="unused",
            is_admin=is_admin, policies=list(policies),
        )
    return TestClient(app)


def slave_api_client():
    app = FastAPI()
    app.include_router(slave_agent.router)
    return TestClient(app)


def payload_dict(payload):
    return (payload.model_dump(exclude_unset=True)
            if hasattr(payload, "model_dump") else payload)


@pytest.fixture
def management(monkeypatch):
    methods = {}
    for method in ("settings", "add", "update"):
        methods[method] = Mock(return_value=SETTINGS)
        monkeypatch.setattr(StorageManagementService, method, methods[method])
    return SimpleNamespace(**methods)


@pytest.mark.parametrize("method,path,payload,service_method", OPERATIONS)
@pytest.mark.parametrize("policies", [[], ["vms:create"], ["host:get"]])
def test_storage_settings_require_their_own_policy(
        management, monkeypatch, method, path, payload, service_method, policies):
    lookup = Mock()
    monkeypatch.setattr(host.SlaveService, "get_slave", lookup)
    response = api_client(policies).request(method, path, json=payload)
    assert response.status_code == 403
    for action in (management.settings, management.add, management.update):
        action.assert_not_called()
    lookup.assert_not_called()


@pytest.mark.parametrize("method,path,payload,service_method", OPERATIONS)
def test_storage_settings_require_authentication(
        management, method, path, payload, service_method):
    response = api_client(authenticated=False).request(method, path, json=payload)
    assert response.status_code in (401, 403)
    getattr(management, service_method).assert_not_called()


@pytest.mark.parametrize("policies,is_admin", [
    (["storage:get"], False),
    (["storage:manage"], False),
    (["distribox:admin"], False),
    ([], True),
])
def test_storage_discovery_accepts_read_or_manage_permission(
        management, policies, is_admin):
    response = api_client(policies, is_admin=is_admin).get(
        "/host/storage/settings")
    assert response.status_code == 200
    assert response.json() == SETTINGS
    management.settings.assert_called_once_with()


@pytest.mark.parametrize("method,path,payload,service_method", OPERATIONS[1:])
def test_storage_read_permission_does_not_allow_changes(
        management, method, path, payload, service_method):
    response = api_client(["storage:get"]).request(method, path, json=payload)
    assert response.status_code == 403
    getattr(management, service_method).assert_not_called()


@pytest.mark.parametrize("method,path,payload,service_method", OPERATIONS[1:])
@pytest.mark.parametrize("policies,is_admin", [
    (["storage:manage"], False),
    (["distribox:admin"], False),
    ([], True),
])
def test_storage_changes_allow_delegated_operators_and_administrators(
        management, method, path, payload, service_method, policies, is_admin):
    response = api_client(policies, is_admin=is_admin).request(
        method, path, json=payload)
    assert response.is_success
    assert response.json() == SETTINGS
    action = getattr(management, service_method)
    action.assert_called_once()
    assert payload_dict(action.call_args.args[-1]) == payload
    if service_method == "update":
        assert action.call_args.args[0] == "data"


def test_vm_creators_can_still_choose_enabled_storage(monkeypatch, management):
    overview = {"locations": [], "recommended_id": None}
    read = Mock(return_value=overview)
    monkeypatch.setattr(host.StorageService, "overview", read)
    client = api_client(["vms:create"])
    assert client.get("/host/storage").json() == overview
    assert client.get("/host/storage/settings").status_code == 403
    read.assert_called_once_with()
    management.settings.assert_not_called()


@pytest.mark.parametrize("method,path,payload,service_method", [
    ("POST", "/host/storage/locations", {"path": "/data"}, "add"),
    ("POST", "/host/storage/locations",
     {"mount_id": "mount-data", "path": "/etc"}, "add"),
    ("POST", "/host/storage/locations",
     {"mount_id": "mount-data", "name": ""}, "add"),
    ("PATCH", "/host/storage/locations/data", {"path": "/etc"}, "update"),
    ("PATCH", "/host/storage/locations/data", {"name": ""}, "update"),
    ("PATCH", "/host/storage/locations/data", {}, "update"),
])
def test_storage_api_rejects_arbitrary_paths_and_invalid_updates(
        management, method, path, payload, service_method):
    response = api_client(["storage:manage"]).request(method, path, json=payload)
    assert response.status_code in (400, 422)
    getattr(management, service_method).assert_not_called()


@pytest.fixture
def remote(monkeypatch):
    slave = SimpleNamespace(id=uuid4(), name="Other host", status="online")
    lookup = Mock(return_value=slave)
    monkeypatch.setattr(host.SlaveService, "get_slave", lookup)
    helpers = {}
    for name in ("slave_get_storage_settings", "slave_add_storage", "slave_update_storage"):
        helper = Mock(return_value=SETTINGS)
        monkeypatch.setattr(slave_client, name, helper)
        if hasattr(host, name):
            monkeypatch.setattr(host, name, helper)
        helpers[name] = helper
    return SimpleNamespace(slave=slave, lookup=lookup, **helpers)


@pytest.mark.parametrize("method,path,payload,service_method", OPERATIONS)
def test_master_denies_remote_access_before_host_lookup(
        management, remote, method, path, payload, service_method):
    response = api_client(["vms:create"]).request(
        method, path, params={"slave_id": str(remote.slave.id)}, json=payload)
    assert response.status_code == 403
    remote.lookup.assert_not_called()
    remote.slave_get_storage_settings.assert_not_called()
    remote.slave_add_storage.assert_not_called()
    remote.slave_update_storage.assert_not_called()


@pytest.mark.parametrize("method,path,payload,service_method", OPERATIONS)
@pytest.mark.parametrize("missing", [False, True])
def test_remote_storage_requires_an_online_known_host(
        management, remote, method, path, payload, service_method, missing):
    if missing:
        remote.lookup.return_value = None
    else:
        remote.slave.status = "offline"
    response = api_client(["storage:manage"]).request(
        method, path, params={"slave_id": str(remote.slave.id)}, json=payload)
    assert response.status_code == (404 if missing else 503)
    getattr(management, service_method).assert_not_called()
    remote.slave_get_storage_settings.assert_not_called()
    remote.slave_add_storage.assert_not_called()
    remote.slave_update_storage.assert_not_called()


@pytest.mark.parametrize("method,path,payload,service_method", OPERATIONS)
def test_remote_storage_uses_only_the_selected_host(
        management, remote, method, path, payload, service_method):
    response = api_client(["storage:manage"]).request(
        method, path, params={"slave_id": str(remote.slave.id)}, json=payload)
    assert response.is_success
    assert response.json() == SETTINGS
    remote.lookup.assert_called_once_with(str(remote.slave.id))
    helper = {
        "settings": remote.slave_get_storage_settings,
        "add": remote.slave_add_storage,
        "update": remote.slave_update_storage,
    }[service_method]
    helper.assert_called_once()
    assert helper.call_args.args[0] is remote.slave
    if payload is not None:
        assert payload_dict(helper.call_args.args[-1]) == payload
    if service_method == "update":
        assert helper.call_args.args[1] == "data"
    for action in (management.settings, management.add, management.update):
        action.assert_not_called()


@pytest.mark.parametrize("method,path,payload,service_method", OPERATIONS)
@pytest.mark.parametrize("token", [None, "wrong-token", "slave-secret"])
def test_slave_storage_administration_requires_its_shared_token(
        management, monkeypatch, method, path, payload, service_method, token):
    monkeypatch.setattr(slave_auth, "SLAVE_API_KEY", "slave-secret")
    headers = {} if token is None else {"X-Slave-Token": token}
    response = slave_api_client().request(method, path, json=payload, headers=headers)
    action = getattr(management, service_method)
    if token == "slave-secret":
        assert response.is_success
        assert response.json() == SETTINGS
        action.assert_called_once()
    else:
        assert response.status_code in (401, 403, 422)
        action.assert_not_called()


@pytest.mark.parametrize("helper_name,method,path,payload", [
    ("slave_get_storage_settings", "GET", "/host/storage/settings", None),
    ("slave_add_storage", "POST", "/host/storage/locations",
     {"mount_id": "mount-data", "name": "Data"}),
    ("slave_update_storage", "PATCH", "/host/storage/locations/data",
     {"enabled": False}),
])
def test_slave_helpers_forward_the_api_contract(
        monkeypatch, helper_name, method, path, payload):
    request = Mock(return_value=SETTINGS)
    monkeypatch.setattr(slave_client, "slave_request", request)
    slave = SimpleNamespace(id=uuid4())
    helper = getattr(slave_client, helper_name)
    if helper_name == "slave_update_storage":
        result = helper(slave, "data", payload)
    elif payload is not None:
        result = helper(slave, payload)
    else:
        result = helper(slave)
    assert result == SETTINGS
    expected_kwargs = {} if payload is None else {"json": payload}
    request.assert_called_once_with(slave, method, path, **expected_kwargs)
