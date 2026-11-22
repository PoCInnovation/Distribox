import threading
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import libvirt
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from lxml import etree
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.core import xml_builder
from app.models.image import ImageRead
from app.models.vm import RecoverableVmCreate
from app.orm.user import UserORM
from app.orm.vm import VmORM
from app.orm.vm_credential import VmCredentialORM
from app.routes import vm as vm_routes
from app.services import operation_service, vm_service
from app.services.vm_service import VmService
from app.utils.auth import get_current_user


def libvirt_error(code, message="libvirt error"):
    error = libvirt.libvirtError(message)
    error.err = (code,)
    return error


class FakeDomain:
    def __init__(
        self, conn, name, xml="<domain/>",
        state=(libvirt.VIR_DOMAIN_SHUTOFF, 0), persistent=True,
    ):
        self._conn = conn
        self.name = name
        self.xml = xml
        self._state = state
        self._persistent = persistent
        self.destroyed = False
        self.undefined_flags = None

    def isActive(self):
        return int(self._state[0] in (
            libvirt.VIR_DOMAIN_RUNNING, libvirt.VIR_DOMAIN_PAUSED))

    def isPersistent(self):
        return int(self._persistent)

    def state(self):
        return self._state

    def destroy(self):
        self.destroyed = True
        self._state = (libvirt.VIR_DOMAIN_SHUTOFF, 0)
        if not self._persistent:
            self._conn.domains.pop(self.name, None)

    def undefineFlags(self, flags):
        if not self._persistent or self.name not in self._conn.domains:
            raise libvirt_error(
                libvirt.VIR_ERR_OPERATION_INVALID,
                "cannot undefine transient domain",
            )
        self.undefined_flags = flags
        self._conn.domains.pop(self.name, None)


class FakeConnection:
    def __init__(self):
        self.domains = {}
        self.defined_xmls = []
        self.lookup_error = None
        self.define_error = None
        self.on_define = None

    def add_domain(
        self, name, xml="<domain/>",
        state=(libvirt.VIR_DOMAIN_SHUTOFF, 0), persistent=True,
    ):
        domain = FakeDomain(self, name, xml, state=state, persistent=persistent)
        self.domains[name] = domain
        return domain

    def lookupByName(self, name):
        if self.lookup_error is not None:
            raise self.lookup_error
        domain = self.domains.get(name)
        if domain is None:
            raise libvirt_error(
                libvirt.VIR_ERR_NO_DOMAIN, f"Domain not found: {name}")
        return domain

    def defineXML(self, xml):
        if self.define_error is not None:
            raise self.define_error
        name = etree.fromstring(xml.encode()).findtext("name")
        assert name is not None
        domain = self.add_domain(name, xml)
        self.defined_xmls.append(xml)
        if self.on_define is not None:
            self.on_define(domain)
        return domain

    def domainXMLToNative(self, fmt, xml, flags):
        return "qemu-system-x86_64"


@pytest.fixture
def env(tmp_path, monkeypatch):
    vms_dir = tmp_path / "vms"
    images_dir = tmp_path / "images"
    vms_dir.mkdir()
    images_dir.mkdir()

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    conn = FakeConnection()
    image = ImageRead(
        name="Ubuntu", image="ubuntu.qcow2", version="24.04",
        distribution="ubuntu", family="ubuntu", revision=1, firmware="efi",
    )

    def make_seed(keyboard_layout=None, vm_dir=None):
        seed_path = (vm_dir or images_dir) / "seed.iso"
        seed_path.write_bytes(b"seed")
        return seed_path

    ensure_seed = Mock(side_effect=make_seed)

    monkeypatch.setattr(vm_service, "engine", engine)
    monkeypatch.setattr(operation_service, "engine", engine)
    monkeypatch.setattr(operation_service, "_alive", set())
    monkeypatch.setattr(vm_service, "VMS_DIR", vms_dir)
    monkeypatch.setattr(vm_service, "IMAGES_DIR", images_dir)
    monkeypatch.setattr(xml_builder, "VMS_DIR", vms_dir)
    monkeypatch.setattr(xml_builder, "IMAGES_DIR", images_dir)
    monkeypatch.setattr(vm_service, "ensure_seed_iso", ensure_seed)
    monkeypatch.setattr(vm_service, "get_vm_ip", lambda vm_id: None)
    monkeypatch.setattr(
        vm_service.QEMUConfig, "get_connection", lambda: conn)
    monkeypatch.setattr(
        vm_service.ImageService, "get_distribox_image",
        staticmethod(lambda metadata_filename: image),
    )

    yield SimpleNamespace(
        engine=engine, vms_dir=vms_dir, conn=conn, ensure_seed=ensure_seed,
    )
    engine.dispose()


def orphan_disk(env, vm_id=None):
    vm_id = vm_id or uuid4()
    vm_dir = env.vms_dir / str(vm_id)
    vm_dir.mkdir(parents=True, exist_ok=True)
    (vm_dir / "ubuntu.qcow2").write_bytes(b"qcow2-data")
    return vm_id, vm_dir


def stored_ids(env):
    with Session(env.engine) as session:
        return [vm.id for vm in session.exec(select(VmORM)).all()]


def api_client():
    app = FastAPI()
    app.include_router(vm_routes.router, prefix="/vms")
    admin = UserORM(username="admin", hashed_password="unused", is_admin=True)
    app.dependency_overrides[get_current_user] = lambda: admin
    return TestClient(app)


def test_recover_restores_missing_definition_and_lists_as_stopped(env):
    vm_id, vm_dir = orphan_disk(env)
    client = api_client()

    assert [v["vm_id"] for v in client.get("/vms/recoverable").json()] == [
        str(vm_id)]

    response = client.post("/vms/recover", json={
        "vm_id": str(vm_id), "name": "Recovered Lab",
        "mem": 4, "vcpus": 2, "disk_size": 20,
    })
    assert response.status_code == 201
    assert response.json()["state"] == "Stopped"

    root = etree.fromstring(env.conn.defined_xmls[0].encode())
    assert root.findtext("name") == str(vm_id)
    assert root.find("os").get("firmware") == "efi"
    assert root.find('./devices/disk[@device="disk"]/source').get(
        "file") == str(vm_dir / "ubuntu.qcow2")
    assert root.find('./devices/disk[@device="cdrom"]/source').get(
        "file") == str(vm_dir / "seed.iso")

    assert [(v["id"], v["state"]) for v in client.get("/vms/").json()] == [
        (str(vm_id), "Stopped")]
    assert client.get("/vms/recoverable").json() == []


def test_recover_reuses_persistent_domain_and_rejects_transient(env):
    persistent_id, _ = orphan_disk(env)
    transient_id, _ = orphan_disk(env)
    env.conn.add_domain(
        str(persistent_id), state=(libvirt.VIR_DOMAIN_RUNNING, 0))
    transient = env.conn.add_domain(
        str(transient_id), state=(libvirt.VIR_DOMAIN_RUNNING, 0),
        persistent=False,
    )

    recovered = VmService.recover_vm(RecoverableVmCreate(
        vm_id=persistent_id, name="Persistent", mem=4, vcpus=2, disk_size=20))
    assert recovered.state == "Running"
    assert env.conn.defined_xmls == []
    env.ensure_seed.assert_not_called()

    with pytest.raises(HTTPException) as error:
        VmService.recover_vm(RecoverableVmCreate(
            vm_id=transient_id, name="Transient", mem=4, vcpus=2, disk_size=20))
    assert error.value.status_code == 409
    assert not transient.destroyed
    assert stored_ids(env) == [persistent_id]
    assert [v.vm_id for v in VmService.get_recoverable_vms()] == [
        str(transient_id)]


def test_failed_recovery_leaves_no_stray_db_record(env, monkeypatch):
    vm_id, _ = orphan_disk(env)
    env.conn.define_error = libvirt_error(
        libvirt.VIR_ERR_XML_ERROR, "invalid XML")

    with pytest.raises(HTTPException) as error:
        VmService.recover_vm(RecoverableVmCreate(
            vm_id=vm_id, name="Broken", mem=4, vcpus=2, disk_size=20))
    assert error.value.status_code == 500
    assert stored_ids(env) == []
    assert [v.vm_id for v in VmService.get_recoverable_vms()] == [str(vm_id)]

    # A DB commit failure after define rolls back only a newly created domain.
    env.conn.define_error = None
    monkeypatch.setattr(
        Session, "commit", lambda self: (_ for _ in ()).throw(RuntimeError("db down")))

    with pytest.raises(HTTPException) as db_error:
        VmService.recover_vm(RecoverableVmCreate(
            vm_id=vm_id, name="DB Failure", mem=4, vcpus=2, disk_size=20))
    assert db_error.value.status_code == 500
    assert str(vm_id) not in env.conn.domains
    assert stored_ids(env) == []

    # A pre-existing domain is preserved when DB commit fails.
    existing = env.conn.add_domain(str(vm_id))
    with pytest.raises(HTTPException):
        VmService.recover_vm(RecoverableVmCreate(
            vm_id=vm_id, name="Preexisting", mem=4, vcpus=2, disk_size=20))
    assert existing.undefined_flags is None
    assert str(vm_id) in env.conn.domains


def test_concurrent_cleanup_waits_for_recovery(env):
    vm_id, vm_dir = orphan_disk(env)
    defined, release = threading.Event(), threading.Event()
    env.conn.on_define = lambda _: (defined.set(), release.wait(5))

    clean_error = {}

    def run_clean():
        try:
            VmService.remove_recoverable_vm(str(vm_id))
        except HTTPException as exc:
            clean_error["status"] = exc.status_code

    recover_thread = threading.Thread(
        target=VmService.recover_vm,
        args=(RecoverableVmCreate(
            vm_id=vm_id, name="Recovered", mem=4, vcpus=2, disk_size=20),),
    )
    recover_thread.start()
    assert defined.wait(5)

    clean_thread = threading.Thread(target=run_clean)
    clean_thread.start()
    clean_thread.join(0.05)
    assert clean_thread.is_alive()

    release.set()
    recover_thread.join(5)
    clean_thread.join(5)

    assert clean_error == {"status": 404}
    assert vm_dir.exists()
    assert str(vm_id) in env.conn.domains
    assert stored_ids(env) == [vm_id]


def test_delete_vm_with_missing_or_transient_definition(env):
    missing_id, missing_dir = orphan_disk(env)
    transient_id, transient_dir = orphan_disk(env)
    transient = env.conn.add_domain(
        str(transient_id), state=(libvirt.VIR_DOMAIN_RUNNING, 0),
        persistent=False,
    )
    with Session(env.engine) as session:
        session.add(VmORM(
            id=missing_id, name="Missing Def", os="ubuntu.qcow2",
            mem=4, vcpus=2, disk_size=20,
        ))
        session.add(VmCredentialORM(
            vm_id=missing_id, name="cred", password="secret",
        ))
        session.add(VmORM(
            id=transient_id, name="Transient", os="ubuntu.qcow2",
            mem=4, vcpus=2, disk_size=20,
        ))
        session.commit()

    client = api_client()
    listed = {v["id"]: v["state"] for v in client.get("/vms/").json()}
    assert listed == {str(missing_id): "Unknown", str(transient_id): "Running"}

    assert client.delete(f"/vms/{missing_id}").status_code == 204
    assert not missing_dir.exists()

    assert client.delete(f"/vms/{transient_id}").status_code == 204
    assert transient.destroyed and transient.undefined_flags is None
    assert not transient_dir.exists()
    assert stored_ids(env) == []

    # When libvirt itself is unreachable, disk files and DB rows stay intact.
    kept_id, kept_dir = orphan_disk(env)
    with Session(env.engine) as session:
        session.add(VmORM(
            id=kept_id, name="Host Down", os="ubuntu.qcow2",
            mem=4, vcpus=2, disk_size=20,
        ))
        session.commit()
    env.conn.lookup_error = libvirt_error(
        libvirt.VIR_ERR_NO_CONNECT, "libvirtd down")

    assert client.delete(f"/vms/{kept_id}").status_code == 500
    assert kept_dir.exists()
    assert stored_ids(env) == [kept_id]
