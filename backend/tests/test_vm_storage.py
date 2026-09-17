import io
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4
from xml.etree import ElementTree

import libvirt
import pytest
import yaml
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

from app.core import config
from app.models.vm import RecoverableVmCreate, VmCreate
from app.orm.user import UserORM  # Register the users foreign key for SQLite.
from app.orm.vm import VmORM
from app.orm.slave import SlaveORM
from app.services import slave_client, slave_service, ssh_guest, storage_service, vm_service
from app.services.storage_service import GIB, StorageService


class MissingDomain(libvirt.libvirtError):
    def get_error_code(self):
        return libvirt.VIR_ERR_NO_DOMAIN


@pytest.fixture
def host(monkeypatch, tmp_path):
    default = tmp_path / 'default'
    data = tmp_path / 'data'
    for root in (default, data):
        (root / 'vms').mkdir(parents=True)
        (root / 'images').mkdir()
    marker = str(uuid4())
    (data / '.distribox-storage-id').write_text(marker)
    configuration = default / 'storage.json'
    configuration.write_text(json.dumps({'version': 1, 'pools': [
        {'id': 'data', 'name': 'Data', 'path': str(data), 'marker': marker},
    ]}))
    monkeypatch.setattr(storage_service, 'BASE_DIR', default)
    monkeypatch.setattr(storage_service, 'CONFIG_PATH', configuration)
    monkeypatch.setattr(storage_service.shutil, 'disk_usage', lambda path: SimpleNamespace(
        total=1000 * GIB, free=(600 if Path(path) == data else 100) * GIB))
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False},
                           poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(vm_service, 'engine', engine)
    monkeypatch.setattr(config, 'engine', engine)
    monkeypatch.setattr(slave_service, 'engine', engine)

    metadata = {'name': 'Test image', 'image': 'test.qcow2', 'version': '1',
                'distribution': 'Test', 'family': 'Linux', 'revision': 1}
    image_bytes = b'complete qcow2 content'
    s3 = Mock()
    s3.get_object.side_effect = lambda **kwargs: {
        'Body': io.BytesIO(yaml.safe_dump(metadata).encode())}
    s3.head_object.return_value = {'ContentLength': len(image_bytes)}
    s3.download_file.side_effect = lambda bucket, key, path: Path(
        path).write_bytes(image_bytes)
    monkeypatch.setattr(vm_service, 's3', s3)
    monkeypatch.setattr(vm_service, 'ensure_seed_iso',
                        lambda keyboard_layout=None, vm_dir=None: (vm_dir / 'seed.iso').write_bytes(b'iso'))
    resize = Mock()
    monkeypatch.setattr(vm_service.subprocess, 'run', resize)
    monkeypatch.setattr(vm_service, 'get_vm_ip', lambda vm_id: None)
    domains = {}
    connection = Mock()

    def lookup(vm_id):
        if vm_id not in domains:
            raise MissingDomain('not found')
        return domains[vm_id]

    def define(xml):
        vm_id = ElementTree.fromstring(xml).findtext('name')
        domain = Mock()
        domain.state.return_value = (libvirt.VIR_DOMAIN_SHUTOFF, 0)
        domain.isActive.return_value = False
        domain.XMLDesc.return_value = xml
        domain.undefine.side_effect = lambda: domains.pop(vm_id, None)
        domains[vm_id] = domain
        return domain

    connection.lookupByName.side_effect = lookup
    connection.defineXML.side_effect = define
    monkeypatch.setattr(config.QEMUConfig,
                        'get_connection', lambda: connection)
    yield SimpleNamespace(default=default, data=data, engine=engine, metadata=metadata,
                          s3=s3, domains=domains, connection=connection, resize=resize,
                          image_bytes=image_bytes)
    engine.dispose()


def vm_directories(root):
    return [path for path in (root / 'vms').iterdir() if path.is_dir()]


def create_payload(**kwargs):
    return VmCreate(name='My VM', os='test.qcow2', mem=2, vcpus=1,
                    disk_size=10, activate_at_start=False, **kwargs)


def test_automatic_storage_keeps_download_disk_seed_and_identity_together(host):
    vm = vm_service.VmService.create_vm(create_payload())
    directory = host.data / 'vms' / str(vm.id)
    assert vm.storage_id == 'data'
    assert vm.storage_path == str(host.data)
    assert (directory / 'test.qcow2').read_bytes() == host.image_bytes
    assert (directory / 'seed.iso').read_bytes() == b'iso'
    assert not list((host.default / 'images').iterdir())
    assert not vm_directories(host.default)
    assert Path(
        host.s3.download_file.call_args.args[2]).parent == host.data / 'images'
    xml = ElementTree.fromstring(host.connection.defineXML.call_args.args[0])
    paths = [source.get('file')
             for source in xml.findall('./devices/disk/source')]
    assert paths == [str(directory / 'test.qcow2'),
                     str(directory / 'seed.iso')]
    with Session(host.engine) as session:
        assert session.get(VmORM, vm.id).storage_id == 'data'
    assert ssh_guest._vm_directory(str(vm.id)) == directory
    assert vm_service.Vm.get(str(vm.id)).storage_id == 'data'


def test_explicit_storage_stays_on_selected_location(host):
    vm = vm_service.VmService.create_vm(create_payload(storage_id='default'))
    assert vm.storage_id == 'default'
    assert (host.default / 'vms' / str(vm.id) / 'test.qcow2').is_file()
    assert not list((host.data / 'images').iterdir())


def test_cache_reused_until_revision_changes(host):
    for _ in range(2):
        vm_service.VmService.create_vm(create_payload())
    assert host.s3.download_file.call_count == 1
    host.metadata['revision'] = 2
    vm_service.VmService.create_vm(create_payload())
    assert host.s3.download_file.call_count == 2
    cached = yaml.safe_load(
        (host.data / 'images' / 'test.metadata.yaml').read_text())
    assert cached['revision'] == 2
    assert not list((host.data / 'images').glob('*.part'))


@pytest.mark.parametrize('already_cached', [False, True])
def test_failed_download_never_publishes_partial_image_or_new_revision(host, already_cached):
    if already_cached:
        vm_service.VmService.create_vm(create_payload())
        host.metadata['revision'] = 2
    count_before = len(host.domains)

    def fail(bucket, key, path):
        Path(path).write_bytes(b'partial')
        raise OSError('connection lost')

    host.s3.download_file.side_effect = fail
    with pytest.raises(HTTPException) as failure:
        vm_service.VmService.create_vm(create_payload())
    assert failure.value.status_code == 502
    assert len(host.domains) == count_before
    with Session(host.engine) as session:
        assert len(session.exec(select(VmORM)).all()) == count_before
    assert len(vm_directories(host.data)) == count_before
    assert not list((host.data / 'images').glob('*.part'))
    image = host.data / 'images' / 'test.qcow2'
    if already_cached:
        assert image.read_bytes() == host.image_bytes
        assert yaml.safe_load(
            (image.parent / 'test.metadata.yaml').read_text())['revision'] == 1
    else:
        assert not image.exists()
        assert not (image.parent / 'test.metadata.yaml').exists()


def test_capacity_checks_include_download_and_copy_before_download(host, monkeypatch):
    host.s3.head_object.return_value = {'ContentLength': 5 * GIB}
    monkeypatch.setattr(storage_service.shutil, 'disk_usage', lambda _: SimpleNamespace(
        total=100 * GIB, free=20 * GIB))
    with pytest.raises(HTTPException) as failure:
        vm_service.VmService.create_vm(create_payload(storage_id='data'))
    assert failure.value.status_code == 507
    host.s3.download_file.assert_not_called()
    assert not vm_directories(host.data)
    assert not vm_directories(host.default)


def test_failed_definition_cleans_vm_but_retains_complete_cache(host):
    host.connection.defineXML.side_effect = RuntimeError('libvirt refused')
    with pytest.raises(RuntimeError):
        vm_service.VmService.create_vm(create_payload())
    assert not vm_directories(host.data)
    assert (host.data / 'images' / 'test.qcow2').read_bytes() == host.image_bytes
    with Session(host.engine) as session:
        assert session.exec(select(VmORM)).all() == []


def test_failed_start_cleans_domain_record_and_files(host, monkeypatch):
    monkeypatch.setattr(vm_service.Vm, 'start', Mock(
        side_effect=HTTPException(409, 'cannot start')))
    payload = create_payload()
    payload.activate_at_start = True
    with pytest.raises(HTTPException):
        vm_service.VmService.create_vm(payload)
    assert not host.domains
    assert not vm_directories(host.data)
    with Session(host.engine) as session:
        assert session.exec(select(VmORM)).all() == []


def test_missing_mount_blocks_start_delete_and_ssh_without_touching_default(host):
    vm = vm_service.VmService.create_vm(create_payload())
    (host.data / '.distribox-storage-id').unlink()
    for operation in (vm.start, vm.remove, lambda: ssh_guest._vm_directory(str(vm.id))):
        with pytest.raises(HTTPException) as failure:
            operation()
        assert failure.value.status_code == 409
    assert str(vm.id) in host.domains
    assert not vm_directories(host.default)
    with Session(host.engine) as session:
        assert session.get(VmORM, vm.id) is not None


def test_duplicate_and_delete_use_original_pool_and_do_not_copy_ssh_identity(host):
    source = vm_service.VmService.create_vm(create_payload(ssh_enabled=True))
    source_directory = host.data / 'vms' / str(source.id)
    (source_directory / 'ssh-client-key.enc').write_text('encrypted private identity')
    duplicate = vm_service.VmService.duplicate_vm(str(source.id))
    assert duplicate.storage_id == 'data'
    assert duplicate.ssh_enabled is False
    destination = host.data / 'vms' / str(duplicate.id)
    assert (destination / 'test.qcow2').read_bytes() == host.image_bytes
    assert not (destination / 'ssh-client-key.enc').exists()
    duplicate.remove()
    assert not destination.exists()
    assert source_directory.is_dir()
    with Session(host.engine) as session:
        assert session.get(VmORM, duplicate.id) is None
        assert session.get(VmORM, source.id) is not None


def test_recovery_uses_selected_pool_even_when_registry_is_unavailable(host, monkeypatch):
    vm_id = uuid4()
    directory = host.data / 'vms' / str(vm_id)
    directory.mkdir()
    (directory / 'test.qcow2').write_bytes(host.image_bytes)
    monkeypatch.setattr(vm_service.ImageService,
                        'get_distribox_image', lambda _: None)
    entries = vm_service.VmService.get_recoverable_vms()
    assert [(entry.vm_id, entry.storage_id)
            for entry in entries] == [(str(vm_id), 'data')]
    vm = vm_service.VmService.recover_vm(RecoverableVmCreate(
        vm_id=vm_id, name='Recovered', mem=2, vcpus=1, disk_size=10, storage_id='data'))
    assert vm.storage_id == 'data'
    assert str(directory / 'test.qcow2') in host.domains[str(vm_id)].XMLDesc(0)
    assert not vm_directories(host.default)
    with pytest.raises(HTTPException) as failure:
        vm_service.VmService.remove_recoverable_vm(str(vm_id), 'data')
    assert failure.value.status_code == 404
    assert directory.exists()


def test_ambiguous_recovery_requires_location_and_ignores_non_uuid_directories(host):
    vm_id = str(uuid4())
    for root in (host.default, host.data):
        directory = root / 'vms' / vm_id
        directory.mkdir()
        (directory / 'test.qcow2').write_bytes(host.image_bytes)
        (root / 'vms' / 'not-a-vm').mkdir()
    with pytest.raises(HTTPException) as failure:
        vm_service.VmService._recoverable_source(vm_id)
    assert failure.value.status_code == 409
    vm_service.VmService.remove_recoverable_vm(vm_id, 'data')
    assert not (host.data / 'vms' / vm_id).exists()
    assert (host.default / 'vms' / vm_id).exists()


@pytest.mark.parametrize('image', ['../test.qcow2', '/tmp/test.qcow2', 'a/../../test.qcow2'])
def test_unsafe_image_paths_never_contact_registry(host, image):
    payload = create_payload()
    payload.os = image
    with pytest.raises(HTTPException) as failure:
        vm_service.VmService.create_vm(payload)
    assert failure.value.status_code == 400
    host.s3.get_object.assert_not_called()


def test_slave_receives_storage_selection_and_master_records_remote_choice(host, monkeypatch):
    slave = SlaveORM(name='Other host', hostname='host',
                     api_key='test', status='online')
    with Session(host.engine) as session:
        session.add(slave)
        session.commit()
        session.refresh(slave)
        slave_id = slave.id
    remote_id = uuid4()
    create = Mock(return_value={'id': str(
        remote_id), 'storage_id': 'remote-data'})
    monkeypatch.setattr(slave_client, 'slave_create_vm', create)
    payload = create_payload(slave_id=slave_id, storage_id='remote-data')
    vm_service.VmService.create_vm(payload)
    assert create.call_args.args[1]['storage_id'] == 'remote-data'
    with Session(host.engine) as session:
        assert session.get(VmORM, remote_id).storage_id == 'remote-data'
    host.s3.get_object.assert_not_called()


def test_storage_choice_cannot_be_combined_with_automatic_host(host):
    with pytest.raises(HTTPException) as failure:
        vm_service.VmService.create_vm(
            create_payload(storage_id='data', auto_place=True))
    assert failure.value.status_code == 400
    host.s3.get_object.assert_not_called()


def test_disabling_storage_blocks_new_vms_and_duplicates_but_keeps_existing_access(host):
    original = vm_service.VmService.create_vm(create_payload(storage_id='data'))
    configuration = host.default / 'storage.json'
    data = json.loads(configuration.read_text())
    data['pools'][0]['enabled'] = False
    configuration.write_text(json.dumps(data))
    assert StorageService.vm_dir('data', original.id).is_dir()
    assert ssh_guest._vm_directory(str(original.id)).is_dir()
    assert vm_service.Vm.get(str(original.id)).storage_id == 'data'
    for action in (
        lambda: vm_service.VmService.create_vm(create_payload(storage_id='data')),
        lambda: vm_service.VmService.duplicate_vm(str(original.id)),
    ):
        with pytest.raises(HTTPException) as error:
            action()
        assert error.value.status_code == 409
    automatic = vm_service.VmService.create_vm(create_payload())
    assert automatic.storage_id == 'default'
    assert StorageService.overview()['recommended_id'] == 'default'


def test_automatic_storage_tries_cached_pool_when_download_would_not_fit(host, monkeypatch):
    image_size = len(host.image_bytes)
    cached = host.data / 'images'
    (cached / 'test.qcow2').write_bytes(host.image_bytes)
    (cached / 'test.metadata.yaml').write_text(yaml.safe_dump(host.metadata))
    monkeypatch.setattr(storage_service.shutil, 'disk_usage', lambda path: SimpleNamespace(
        total=100 * GIB,
        free=11 * GIB + (image_size + 5 if Path(path) == host.default else image_size)))
    vm = vm_service.VmService.create_vm(create_payload())
    assert vm.storage_id == 'data'
    host.s3.download_file.assert_not_called()
    with pytest.raises(HTTPException) as failure:
        vm_service.VmService.create_vm(create_payload(storage_id='default'))
    assert failure.value.status_code == 507


def test_recovery_rejects_dangling_seed_symlink_before_writing(host):
    vm_id = uuid4()
    directory = host.data / 'vms' / str(vm_id)
    directory.mkdir()
    (directory / 'test.qcow2').write_bytes(host.image_bytes)
    elsewhere = host.default / 'must-not-be-written'
    (directory / 'seed.iso').symlink_to(elsewhere)
    with pytest.raises(HTTPException) as failure:
        vm_service.VmService.recover_vm(RecoverableVmCreate(
            vm_id=vm_id, name='Recovered', mem=2, vcpus=1, disk_size=10, storage_id='data'))
    assert failure.value.status_code == 409
    assert not elsewhere.exists()
    assert not host.domains


def test_start_and_duplicate_reject_vm_disk_symlink(host):
    vm = vm_service.VmService.create_vm(create_payload())
    image = host.data / 'vms' / str(vm.id) / 'test.qcow2'
    image.unlink()
    elsewhere = host.default / 'unrelated.qcow2'
    elsewhere.write_bytes(b'other disk')
    image.symlink_to(elsewhere)
    for operation in (vm.start, lambda: vm_service.VmService.duplicate_vm(str(vm.id))):
        with pytest.raises(HTTPException) as failure:
            operation()
        assert failure.value.status_code == 409
    assert elsewhere.read_bytes() == b'other disk'


def test_existing_database_migrates_vms_to_default_pool_idempotently(host):
    from sqlalchemy import text

    vm_id = uuid4()
    with host.engine.begin() as connection:
        connection.execute(text('ALTER TABLE vms DROP COLUMN storage_id'))
        connection.execute(text(
            "INSERT INTO vms (id, name, os, mem, vcpus, disk_size, ssh_enabled) "
            "VALUES (:id, 'Legacy VM', 'test.qcow2', 2, 1, 10, FALSE)"), {'id': vm_id.hex})
    config.init_db()
    config.init_db()
    with Session(host.engine) as session:
        assert session.get(VmORM, vm_id).storage_id == 'default'
