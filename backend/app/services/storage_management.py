"""Storage settings use a narrow host service, never a shell or Docker socket."""
import http.client
import json
import socket
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException

from app.models.storage import StorageAdd, StorageSettings, StorageUpdate, StorageCandidate
from app.services.storage_service import BASE_DIR, StorageService, STORAGE_ID

SOCKET_PATH = BASE_DIR / "run" / "storage.sock"


class HostStorageConnection(http.client.HTTPConnection):
    def __init__(self, path: Path):
        super().__init__("localhost", timeout=30)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(str(self.path))


def host_storage_request(method: str, path: str, payload: dict | None = None):
    connection = HostStorageConnection(SOCKET_PATH)
    try:
        body = json.dumps(payload) if payload is not None else None
        connection.request(method, path, body=body, headers={
                           "Content-Type": "application/json"})
        response = connection.getresponse()
        raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError("Storage service response is too large")
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("Storage service response must be an object")
        if response.status >= 400:
            detail = data.get("detail")
            raise HTTPException(
                response.status if response.status in (
                    400, 404, 409, 422, 503, 507) else 503,
                detail if isinstance(
                    detail, str) else "The host storage service could not complete the request",
            )
        return data
    except (OSError, http.client.HTTPException) as exc:
        raise HTTPException(
            503, "The host storage service is unavailable. Ask the host operator to update or repair the Distribox installation.") from exc
    except ValueError as exc:
        raise HTTPException(
            503, "The host storage service returned an invalid response") from exc
    finally:
        connection.close()


class StorageManagementService:
    @staticmethod
    def settings() -> StorageSettings:
        locations = StorageService.overview()["locations"]
        candidates = []
        discovery_error = None
        try:
            response = host_storage_request("GET", "/mounts")
            if not isinstance(response.get("candidates"), list):
                raise ValueError("Expected a partition list")
            candidates = [StorageCandidate(**item)
                          for item in response["candidates"]]
        except HTTPException as exc:
            discovery_error = exc.detail
        except (KeyError, TypeError, ValueError):
            discovery_error = "The host storage service returned an invalid partition list"
        return StorageSettings(locations=locations, candidates=candidates,
                               discovery_error=discovery_error)

    @classmethod
    def add(cls, payload: StorageAdd) -> StorageSettings:
        result = host_storage_request(
            "POST", "/locations", payload.model_dump(exclude_none=True))
        # The host persists configuration before responding. Fail explicitly if a
        # container was deployed without the required mount propagation.
        storage_id = result.get("id")
        if not isinstance(storage_id, str):
            raise HTTPException(
                503, "The host storage service returned an invalid location")
        try:
            StorageService.get(storage_id)
        except HTTPException as exc:
            raise HTTPException(
                409, "Storage was registered but is not visible to the backend. Ask the host operator to check the installation's storage mount.") from exc
        return cls.settings()

    @classmethod
    def update(cls, storage_id: str, payload: StorageUpdate) -> StorageSettings:
        if storage_id == "default":
            raise HTTPException(409, "System storage cannot be changed here")
        if not STORAGE_ID.fullmatch(storage_id):
            raise HTTPException(400, "Invalid storage location")
        host_storage_request("PATCH", f"/locations/{quote(storage_id, safe='')}",
                             payload.model_dump(exclude_none=True))
        return cls.settings()
