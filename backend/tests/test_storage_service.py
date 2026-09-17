import json
import os
import shutil
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.services import storage_service as storage


@pytest.fixture
def pools(tmp_path, monkeypatch):
    system, data = tmp_path / "system", tmp_path / "data"
    for root in (system, data):
        (root / "vms").mkdir(parents=True)
        (root / "images").mkdir()
    marker = str(uuid4())
    (data / ".distribox-storage-id").write_text(marker)
    config = system / "storage.json"
    config.write_text(json.dumps({"version": 1, "pools": [
        {"id": "data", "name": "Data", "path": str(data), "marker": marker},
    ]}))
    monkeypatch.setattr(storage, "BASE_DIR", system)
    monkeypatch.setattr(storage, "CONFIG_PATH", config)

    def usage(path):
        free = 600 if str(path).startswith(str(data)) else 10
        return shutil._ntuple_diskusage(700 * storage.GIB, (700 - free) * storage.GIB, free * storage.GIB)

    monkeypatch.setattr(storage.shutil, "disk_usage", usage)
    return system, data


def test_auto_uses_larger_partition_and_explicit_choice_is_respected(pools):
    assert storage.StorageService.select(None, 20 * storage.GIB).id == "data"
    assert storage.StorageService.select("default", storage.GIB).id == "default"
    overview = storage.StorageService.overview()
    assert overview["recommended_id"] == "data"
    assert [entry["available_gib"] for entry in overview["locations"]] == [10, 600]


def test_explicit_full_partition_does_not_fall_back(pools):
    with pytest.raises(HTTPException) as error:
        storage.StorageService.select("default", 20 * storage.GIB)
    assert error.value.status_code == 507
    assert "System storage" in error.value.detail


def test_missing_mount_marker_is_unavailable_and_never_recreated(pools):
    _, data = pools
    (data / ".distribox-storage-id").unlink()
    with pytest.raises(HTTPException) as error:
        storage.StorageService.get("data")
    assert error.value.status_code == 409
    assert storage.StorageService.overview()["locations"][1]["available"] is False
    assert not (data / ".distribox-storage-id").exists()


def test_wrong_disk_at_same_path_is_rejected(pools):
    _, data = pools
    (data / ".distribox-storage-id").write_text(str(uuid4()))
    with pytest.raises(HTTPException):
        storage.StorageService.get("data")


@pytest.mark.parametrize("part", ["vms", "images", ".distribox-storage-id"])
def test_symlinked_storage_components_rejected(pools, tmp_path, part):
    _, data = pools
    source = data / part
    target = tmp_path / f"moved-{part}"
    source.rename(target)
    source.symlink_to(target)
    with pytest.raises(HTTPException):
        storage.StorageService.get("data")


def test_vm_path_rejects_symlink_and_traversal(pools, tmp_path):
    _, data = pools
    vm_id = uuid4()
    (data / "vms" / str(vm_id)).symlink_to(tmp_path)
    for candidate in (vm_id, "../../etc"):
        with pytest.raises(HTTPException):
            storage.StorageService.vm_dir("data", candidate)


@pytest.mark.parametrize("image", ["../evil.qcow2", "/etc/evil.qcow2", "a/b.qcow2",
                                   "a\\b.qcow2", "--evil.qcow2", "bad\x00.qcow2"])
def test_image_path_traversal_rejected(image):
    with pytest.raises(HTTPException):
        storage.safe_image_name(image)


def test_no_config_preserves_legacy_storage(pools):
    system, _ = pools
    (system / "storage.json").unlink()
    assert storage.StorageService.select(None).path == system
    assert storage.StorageService.vm_dir("default", uuid4()).parent == system / "vms"


def test_unknown_id_is_never_interpreted_as_path(pools):
    with pytest.raises(HTTPException) as error:
        storage.StorageService.get("/data")
    assert error.value.status_code == 400


@pytest.mark.parametrize("contents", ["not json", "[]", '{"version":1,"pools":[1]}',
                                      '{"version":1,"pools":[{"id":"data","name":"Data","path":"/data","marker":1}]}'])
def test_invalid_config_fails_closed(pools, contents):
    system, _ = pools
    (system / "storage.json").write_text(contents)
    with pytest.raises(HTTPException) as error:
        storage.StorageService.select(None)
    assert error.value.status_code == 503


def test_read_only_storage_unavailable(pools, monkeypatch):
    original = os.statvfs(pools[1])
    values = list(original)
    values[8] |= os.ST_RDONLY
    monkeypatch.setattr(storage.os, "statvfs", lambda _: os.statvfs_result(values))
    with pytest.raises(HTTPException):
        storage.StorageService.get("data")


def test_lock_revalidates_mount_before_writing(pools):
    _, data = pools
    location = storage.StorageService.get("data")
    (data / ".distribox-storage-id").unlink()
    with pytest.raises(HTTPException):
        with storage.StorageService.lock(location):
            pytest.fail("Unavailable storage was locked for writes")
    assert not (data / "images" / ".storage.lock").exists()


@pytest.mark.parametrize("policy,expected", [("vms:create", 200), ("host:get", 403)])
def test_storage_discovery_requires_vm_creation_permission(pools, policy, expected):
    from app.routes.host import router
    from app.orm.user import UserORM
    from app.utils.auth import get_current_user
    app = FastAPI()
    app.include_router(router, prefix="/host")
    app.dependency_overrides[get_current_user] = lambda: UserORM(
        username="user", hashed_password="unused", policies=[policy])
    response = TestClient(app).get("/host/storage")
    assert response.status_code == expected
    if expected == 200:
        assert response.json()["recommended_id"] == "data"


def test_storage_discovery_requires_authentication(pools):
    from app.routes.host import router
    app = FastAPI()
    app.include_router(router, prefix="/host")
    assert TestClient(app).get("/host/storage").status_code in (401, 403)


def test_storage_discovery_proxies_only_selected_online_node(pools, monkeypatch):
    from app.routes import host
    from app.orm.slave import SlaveORM
    from app.orm.user import UserORM
    from app.utils.auth import get_current_user
    from app.services import slave_client
    slave = SlaveORM(name="Other host", hostname="private", api_key="unused", status="online")
    monkeypatch.setattr(host.SlaveService, "get_slave", lambda _: slave)
    monkeypatch.setattr(slave_client, "slave_get_storage", lambda node: {
        "locations": [], "recommended_id": None,
    } if node.id == slave.id else pytest.fail("Wrong node"))
    app = FastAPI()
    app.include_router(host.router, prefix="/host")
    app.dependency_overrides[get_current_user] = lambda: UserORM(
        username="user", hashed_password="unused", policies=["vms:create"])
    client = TestClient(app)
    assert client.get(f"/host/storage?slave_id={slave.id}").json()["locations"] == []
    slave.status = "offline"
    assert client.get(f"/host/storage?slave_id={slave.id}").status_code == 503


def test_seed_never_creates_missing_storage_directories(tmp_path):
    from app.utils.seed import ensure_seed_iso
    missing = tmp_path / "unmounted" / "vms" / str(uuid4())
    with pytest.raises(HTTPException) as error:
        ensure_seed_iso(vm_dir=missing)
    assert error.value.status_code == 409
    assert not (tmp_path / "unmounted").exists()


@pytest.mark.parametrize("keyboard", [None, "fr-fr-azerty"])
def test_seed_rejects_dangling_symlink_before_generation(tmp_path, monkeypatch, keyboard):
    from app.utils import seed
    victim = tmp_path / "outside"
    vm_dir = tmp_path / "vm"
    vm_dir.mkdir()
    (vm_dir / "seed.iso").symlink_to(victim)
    monkeypatch.setattr(seed.subprocess, "run", lambda *a, **k: pytest.fail("Followed a seed symlink"))
    with pytest.raises(HTTPException):
        seed.ensure_seed_iso(vm_dir=vm_dir, keyboard_layout=keyboard)
    assert not victim.exists()


def test_seed_generation_failure_preserves_existing_iso(tmp_path, monkeypatch):
    from app.utils import seed
    original = tmp_path / "seed.iso"
    original.write_bytes(b"previous complete seed")

    def fail(*args, **kwargs):
        raise FileNotFoundError("genisoimage missing")

    monkeypatch.setattr(seed.subprocess, "run", fail)
    with pytest.raises(HTTPException):
        seed.ensure_seed_iso(vm_dir=tmp_path, keyboard_layout="fr-fr-azerty")
    assert original.read_bytes() == b"previous complete seed"
    assert list(tmp_path.iterdir()) == [original]


@pytest.mark.skipif(shutil.which("genisoimage") is None, reason="genisoimage is not installed")
def test_seed_is_published_on_selected_storage(tmp_path):
    from app.utils.seed import ensure_seed_iso
    output = ensure_seed_iso(vm_dir=tmp_path, keyboard_layout="fr-fr-azerty")
    assert output == tmp_path / "seed.iso"
    assert output.read_bytes()[32769:32774] == b"CD001"
    assert b"layout: fr" in output.read_bytes()
    assert list(tmp_path.iterdir()) == [output]


def test_managed_alias_requires_mount_and_identity_and_shows_source_path(pools, monkeypatch):
    system, data = pools
    alias = system / 'storage' / 'data'
    alias.mkdir(parents=True)
    (alias / 'images').mkdir()
    (alias / 'vms').mkdir()
    configuration = system / 'storage.json'
    document = json.loads(configuration.read_text())
    entry = document['pools'][0]
    entry.update(path=str(alias), source_path=str(data), managed=True)
    configuration.write_text(json.dumps(document))
    (alias / '.distribox-storage-id').write_text(entry['marker'])
    monkeypatch.setattr(storage, '_is_mount', lambda _: False)
    with pytest.raises(HTTPException):
        storage.StorageService.get('data')
    monkeypatch.setattr(storage, '_is_mount', lambda path: path == alias)
    assert storage.StorageService.get('data').path == alias
    assert storage.StorageService.overview()['locations'][1]['path'] == str(data)
    (alias / '.distribox-storage-id').write_text(str(uuid4()))
    with pytest.raises(HTTPException):
        storage.StorageService.get('data')


@pytest.mark.parametrize('unsafe_path', ['images', 'vms', 'storage/other', 'storage/data/nested'])
def test_managed_alias_cannot_target_other_state_directories(pools, unsafe_path):
    system, data = pools
    configuration = system / 'storage.json'
    document = json.loads(configuration.read_text())
    document['pools'][0].update(path=str(system / unsafe_path), source_path=str(data), managed=True)
    configuration.write_text(json.dumps(document))
    with pytest.raises(HTTPException) as error:
        storage.StorageService.locations()
    assert error.value.status_code == 503


def test_disabled_storage_remains_accessible_to_existing_vms(pools):
    system, data = pools
    configuration = system / 'storage.json'
    document = json.loads(configuration.read_text())
    document['pools'][0]['enabled'] = False
    configuration.write_text(json.dumps(document))
    assert storage.StorageService.get('data').path == data
    assert storage.StorageService.overview()['locations'][1]['available'] is True
    assert storage.StorageService.overview()['recommended_id'] == 'default'
    with pytest.raises(HTTPException) as error:
        storage.StorageService.select('data')
    assert error.value.status_code == 409
