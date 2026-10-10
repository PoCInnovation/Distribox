from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

from fastapi import HTTPException
import pytest

from app.services import slave_client, ssh_guest, ssh_transport, vm_service


@pytest.mark.asyncio
async def test_local_enablement_refreshes_and_can_defer_stopped_guest(monkeypatch):
    vm_id = str(uuid4())
    monkeypatch.setattr(vm_service.VmService, "_get_slave_for_vm", lambda _: None)
    prepare = Mock(return_value={"pending": True})
    monkeypatch.setattr(ssh_guest, "prepare_guest", prepare)

    slave, details = await ssh_transport.prepare_guest_connection(
        vm_id, refresh=True, defer_if_stopped=True)

    assert slave is None
    assert details == {"pending": True}
    prepare.assert_called_once_with(vm_id, refresh=True, defer_if_stopped=True)


@pytest.mark.asyncio
async def test_slave_enablement_refreshes_and_can_defer_stopped_guest(monkeypatch):
    vm_id = str(uuid4())
    slave = SimpleNamespace(status="online")
    monkeypatch.setattr(vm_service.VmService, "_get_slave_for_vm", lambda _: slave)
    prepare = Mock(return_value={"pending": True, "refresh_applied": True})
    monkeypatch.setattr(slave_client, "slave_request", prepare)

    returned_slave, details = await ssh_transport.prepare_guest_connection(
        vm_id, refresh=True, defer_if_stopped=True)

    assert returned_slave is slave
    assert details == {"pending": True, "refresh_applied": True}
    prepare.assert_called_once_with(
        slave, "POST", f"/vms/{vm_id}/ssh/prepare?refresh=true&defer_if_stopped=true")


@pytest.mark.asyncio
async def test_offline_slave_does_not_become_pending_setup(monkeypatch):
    monkeypatch.setattr(vm_service.VmService, "_get_slave_for_vm",
                        lambda _: SimpleNamespace(status="offline"))
    prepare = Mock()
    monkeypatch.setattr(slave_client, "slave_request", prepare)

    with pytest.raises(HTTPException) as failure:
        await ssh_transport.prepare_guest_connection(
            str(uuid4()), refresh=True, defer_if_stopped=True)

    assert failure.value.status_code == 503
    assert failure.value.detail == "VM host is offline"
    prepare.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("details", [None, [], {}, {"pending": True},
                                     {"refresh_applied": True},
                                     {"refresh_applied": True, "pending": "true"}])
async def test_invalid_or_old_slave_reply_is_rejected(monkeypatch, details):
    monkeypatch.setattr(vm_service.VmService, "_get_slave_for_vm",
                        lambda _: SimpleNamespace(status="online"))
    monkeypatch.setattr(slave_client, "slave_request", Mock(return_value=details))

    with pytest.raises(HTTPException) as failure:
        await ssh_transport.prepare_guest_connection(
            str(uuid4()), refresh=True, defer_if_stopped=True)

    assert failure.value.status_code == 503
    assert "update" in failure.value.detail


@pytest.mark.asyncio
async def test_old_slave_can_still_prepare_connections_without_forced_refresh(monkeypatch):
    details = {"host": "192.168.122.42", "port": 22, "username": "user",
               "private_key": "private-key", "host_keys": ["host-key"]}
    monkeypatch.setattr(vm_service.VmService, "_get_slave_for_vm",
                        lambda _: SimpleNamespace(status="online"))
    prepare = Mock(return_value=details)
    monkeypatch.setattr(slave_client, "slave_request", prepare)
    vm_id = str(uuid4())

    _, prepared = await ssh_transport.prepare_guest_connection(vm_id)

    assert prepared == details
    assert prepare.call_args.args[2] == f"/vms/{vm_id}/ssh/prepare"


@pytest.mark.asyncio
@pytest.mark.parametrize("detail", [
    ssh_guest.GUEST_AGENT_REQUIRED,
    ssh_guest.GUEST_SETUP_ERRORS[10],
    ssh_guest.GUEST_SETUP_ERRORS[11],
    "PRIVATE KEY / sensitive host diagnostics",
])
async def test_slave_errors_are_actionable_and_sanitized(monkeypatch, detail):
    monkeypatch.setattr(vm_service.VmService, "_get_slave_for_vm",
                        lambda _: SimpleNamespace(status="online"))
    monkeypatch.setattr(slave_client, "slave_request", Mock(
        side_effect=HTTPException(503, f"Slave error: {detail}")))

    with pytest.raises(HTTPException) as failure:
        await ssh_transport.prepare_guest_connection(str(uuid4()), refresh=True)

    assert failure.value.status_code == 503
    if "PRIVATE KEY" in detail:
        assert "PRIVATE KEY" not in failure.value.detail
        assert "guest agent" in failure.value.detail
    else:
        assert failure.value.detail == detail
