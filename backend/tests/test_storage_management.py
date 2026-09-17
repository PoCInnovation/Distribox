"""Exercise the API-to-host boundary without requiring a privileged service."""
import http.client
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException

from app.models.storage import StorageAdd, StorageSettings, StorageUpdate
from app.services import storage_management as management


LOCATION = {
    "id": "default", "name": "System storage", "path": "/var/lib/distribox",
    "total_gib": 100, "available_gib": 10, "available": True,
}
CANDIDATE = {
    "id": "mount-data", "mount_path": "/data", "filesystem": "ext4",
    "total_gib": 700, "available_gib": 600, "available": True,
}


@pytest.fixture
def connection(monkeypatch):
    response = Mock(status=200)
    response.read.return_value = b'{"candidates": []}'
    client = Mock()
    client.getresponse.return_value = response
    factory = Mock(return_value=client)
    monkeypatch.setattr(management, "HostStorageConnection", factory)
    return SimpleNamespace(client=client, factory=factory, response=response)


@pytest.mark.parametrize("method,path,payload", [
    ("GET", "/mounts", None),
    ("POST", "/locations", {"mount_id": "mount-data"}),
    ("PATCH", "/locations/data", {"enabled": False}),
])
def test_host_client_uses_fixed_socket_and_json_and_closes(
        connection, method, path, payload):
    assert management.host_storage_request(method, path, payload) == {"candidates": []}
    connection.factory.assert_called_once_with(management.SOCKET_PATH)
    connection.client.request.assert_called_once_with(
        method, path, body=None if payload is None else json.dumps(payload),
        headers={"Content-Type": "application/json"},
    )
    connection.response.read.assert_called_once_with(1024 * 1024 + 1)
    connection.client.close.assert_called_once_with()


@pytest.mark.parametrize("failure", [
    FileNotFoundError("socket missing"), PermissionError("socket denied"),
    TimeoutError("timed out"), ConnectionRefusedError("service stopped"),
    http.client.RemoteDisconnected("connection dropped"),
    http.client.BadStatusLine("invalid HTTP"),
])
@pytest.mark.parametrize("stage", ["request", "getresponse", "read"])
def test_host_connection_failures_are_retryable_and_always_closed(
        connection, failure, stage):
    action = (connection.response.read if stage == "read"
              else getattr(connection.client, stage))
    action.side_effect = failure
    with pytest.raises(HTTPException) as error:
        management.host_storage_request("GET", "/mounts")
    assert error.value.status_code == 503
    assert "unavailable" in error.value.detail
    connection.client.close.assert_called_once_with()


@pytest.mark.parametrize("body", [
    b"not-json", b"", b"[]", b"null", b'"string"', b"12",
    b"\xff", b"{" + b" " * (1024 * 1024),
])
def test_host_client_rejects_invalid_or_oversized_response(connection, body):
    connection.response.read.return_value = body
    with pytest.raises(HTTPException) as error:
        management.host_storage_request("GET", "/mounts")
    assert error.value.status_code == 503
    assert "invalid response" in error.value.detail
    connection.client.close.assert_called_once_with()


@pytest.mark.parametrize("status,expected", [
    (400, 400), (404, 404), (409, 409), (422, 422), (503, 503), (507, 507),
    (401, 503), (403, 503), (500, 503), (599, 503),
])
def test_host_error_status_and_detail_have_a_controlled_contract(
        connection, status, expected):
    connection.response.status = status
    connection.response.read.return_value = b'{"detail": "Partition is unavailable"}'
    with pytest.raises(HTTPException) as error:
        management.host_storage_request("POST", "/locations", {"mount_id": "mount-data"})
    assert error.value.status_code == expected
    assert error.value.detail == "Partition is unavailable"
    connection.client.close.assert_called_once_with()


@pytest.mark.parametrize("detail", [None, [], {}, 7])
def test_host_error_does_not_expose_nontext_detail(connection, detail):
    connection.response.status = 409
    connection.response.read.return_value = json.dumps({"detail": detail}).encode()
    with pytest.raises(HTTPException) as error:
        management.host_storage_request("GET", "/mounts")
    assert error.value.status_code == 409
    assert error.value.detail == "The host storage service could not complete the request"


def test_host_connection_uses_unix_socket_and_timeout(monkeypatch):
    socket = Mock()
    create_socket = Mock(return_value=socket)
    monkeypatch.setattr(management.socket, "socket", create_socket)
    connection = management.HostStorageConnection(Path("/configured/run/storage.sock"))
    connection.connect()
    create_socket.assert_called_once_with(management.socket.AF_UNIX, management.socket.SOCK_STREAM)
    socket.settimeout.assert_called_once_with(30)
    socket.connect.assert_called_once_with("/configured/run/storage.sock")
    connection.close()
    socket.close.assert_called_once_with()


@pytest.fixture
def settings_service(monkeypatch):
    overview = Mock(return_value={"locations": [LOCATION], "recommended_id": "default"})
    request = Mock(return_value={"candidates": [CANDIDATE]})
    monkeypatch.setattr(management.StorageService, "overview", overview)
    monkeypatch.setattr(management, "host_storage_request", request)
    return SimpleNamespace(overview=overview, request=request)


def test_settings_merge_local_availability_with_discovered_partitions(settings_service):
    settings = management.StorageManagementService.settings()
    assert settings.locations[0].id == "default"
    assert settings.locations[0].available_gib == 10
    assert settings.candidates[0].mount_path == "/data"
    assert settings.candidates[0].available_gib == 600
    assert settings.discovery_error is None
    settings_service.request.assert_called_once_with("GET", "/mounts")


def test_missing_host_service_preserves_read_only_existing_locations(settings_service):
    settings_service.request.side_effect = HTTPException(503, "Service is unavailable")
    settings = management.StorageManagementService.settings()
    assert [location.id for location in settings.locations] == ["default"]
    assert settings.locations[0].available
    assert settings.candidates == []
    assert settings.discovery_error == "Service is unavailable"


@pytest.mark.parametrize("reply", [
    {}, {"candidates": None}, {"candidates": [None]},
    {"candidates": [{}]}, {"candidates": [CANDIDATE, {"id": "incomplete"}]},
])
def test_bad_partition_discovery_preserves_locations_without_partial_candidates(
        settings_service, reply):
    settings_service.request.return_value = reply
    settings = management.StorageManagementService.settings()
    assert [location.id for location in settings.locations] == ["default"]
    assert settings.candidates == []
    assert settings.discovery_error == "The host storage service returned an invalid partition list"


def test_add_forwards_only_discovered_id_then_verifies_backend_visibility(monkeypatch):
    request = Mock(return_value={"id": "data"})
    verify = Mock()
    updated = StorageSettings(locations=[], candidates=[])
    settings = Mock(return_value=updated)
    monkeypatch.setattr(management, "host_storage_request", request)
    monkeypatch.setattr(management.StorageService, "get", verify)
    monkeypatch.setattr(management.StorageManagementService, "settings", settings)
    assert management.StorageManagementService.add(StorageAdd(mount_id="mount-data")) is updated
    request.assert_called_once_with("POST", "/locations", {"mount_id": "mount-data"})
    verify.assert_called_once_with("data")
    settings.assert_called_once_with()


@pytest.mark.parametrize("reply", [{}, {"id": None}, {"id": 8}, {"id": []}])
def test_add_requires_a_location_identity_from_host(monkeypatch, reply):
    monkeypatch.setattr(management, "host_storage_request", Mock(return_value=reply))
    verify = Mock()
    monkeypatch.setattr(management.StorageService, "get", verify)
    with pytest.raises(HTTPException) as error:
        management.StorageManagementService.add(StorageAdd(mount_id="mount-data"))
    assert error.value.status_code == 503
    verify.assert_not_called()


def test_add_reports_registration_without_mount_visibility(monkeypatch):
    request = Mock(return_value={"id": "data"})
    settings = Mock()
    monkeypatch.setattr(management, "host_storage_request", request)
    monkeypatch.setattr(management.StorageService, "get", Mock(side_effect=HTTPException(409, "Missing mount")))
    monkeypatch.setattr(management.StorageManagementService, "settings", settings)
    with pytest.raises(HTTPException) as error:
        management.StorageManagementService.add(StorageAdd(mount_id="mount-data"))
    assert error.value.status_code == 409
    assert "registered but is not visible" in error.value.detail
    settings.assert_not_called()


@pytest.mark.parametrize("storage_id", [
    "default", "../data", "data/../../etc", "/data", "data?enabled=true", "data#fragment",
    "data%2f..", "data\\next", "Data", "", "x" * 65,
])
def test_update_cannot_target_system_storage_or_inject_host_request_paths(monkeypatch, storage_id):
    request = Mock()
    monkeypatch.setattr(management, "host_storage_request", request)
    with pytest.raises(HTTPException) as error:
        management.StorageManagementService.update(storage_id, StorageUpdate(enabled=False))
    assert error.value.status_code == (409 if storage_id == "default" else 400)
    request.assert_not_called()


def test_update_sends_only_requested_fields_and_refreshes_state(monkeypatch):
    request = Mock(return_value={})
    refreshed = StorageSettings(locations=[], candidates=[])
    settings = Mock(return_value=refreshed)
    monkeypatch.setattr(management, "host_storage_request", request)
    monkeypatch.setattr(management.StorageManagementService, "settings", settings)
    assert management.StorageManagementService.update("data", StorageUpdate(enabled=False)) is refreshed
    request.assert_called_once_with("PATCH", "/locations/data", {"enabled": False})
    settings.assert_called_once_with()


@pytest.mark.parametrize("operation", ["add", "update"])
def test_host_mutation_failure_does_not_report_success_or_refresh(monkeypatch, operation):
    settings = Mock()
    error = HTTPException(409, "Partition changed")
    request = Mock(side_effect=error)
    monkeypatch.setattr(management, "host_storage_request", request)
    monkeypatch.setattr(management.StorageManagementService, "settings", settings)
    with pytest.raises(HTTPException) as failure:
        if operation == "add":
            management.StorageManagementService.add(StorageAdd(mount_id="mount-data"))
        else:
            management.StorageManagementService.update("data", StorageUpdate(enabled=False))
    assert failure.value is error
    settings.assert_not_called()
