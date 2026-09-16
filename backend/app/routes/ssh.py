import os
import re
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session

from app.core.config import engine
from app.models.ssh import SshConnection, SshConnectionRequest, SshSettings, SshSettingsUpdate
from app.orm.user import UserORM
from app.orm.vm import VmORM
from app.services.ssh_access import find_credential
from app.utils.auth import get_current_user, require_policy, user_has_policy

router = APIRouter()


def connection_settings(enabled: bool) -> dict:
    from app.services.ssh_gateway import get_ssh_host_fingerprint

    host = os.getenv("SSH_PUBLIC_HOST") or urlparse(
        os.getenv("FRONTEND_URL", "http://localhost:3000")
    ).hostname
    if not host or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.:-]*", host):
        host = None
    fingerprint = get_ssh_host_fingerprint()
    return {
        "enabled": enabled,
        "available": bool(host and fingerprint),
        "host": host,
        "port": int(os.getenv("SSH_PUBLIC_PORT") or os.getenv("SSH_PORT", "2222")),
        "host_key_fingerprint": fingerprint,
    }


@router.post("/ssh/connection", response_model=SshConnection)
def get_ssh_connection(payload: SshConnectionRequest, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with Session(engine) as session:
        credential = find_credential(session, payload.credential)
        if credential is None:
            raise HTTPException(401, "Invalid or expired VM access secret")
        vm = session.get(VmORM, credential.vm_id)
        if vm is None:
            raise HTTPException(401, "Invalid or expired VM access secret")
        return {
            **connection_settings(vm.ssh_enabled),
            "credential_id": credential.id,
            "vm_name": vm.name,
            "expires_at": credential.expires_at,
        }


@router.get("/vms/{vm_id}/ssh", response_model=SshSettings)
def get_ssh_settings(
    vm_id: UUID,
    current_user: UserORM = Depends(get_current_user),
):
    if not any(user_has_policy(current_user, policy) for policy in ("vms:connect", "vms:ssh:manage")):
        raise HTTPException(
            403, "Missing vms:connect or vms:ssh:manage policy")
    with Session(engine) as session:
        vm = session.get(VmORM, vm_id)
        if vm is None:
            raise HTTPException(404, "VM not found")
        return connection_settings(vm.ssh_enabled)


@router.patch("/vms/{vm_id}/ssh", response_model=SshSettings,
              dependencies=[Depends(require_policy("vms:ssh:manage"))])
def update_ssh_settings(vm_id: UUID, payload: SshSettingsUpdate):
    with Session(engine) as session:
        vm = session.get(VmORM, vm_id)
        if vm is None:
            raise HTTPException(404, "VM not found")
        vm.ssh_enabled = payload.enabled
        session.add(vm)
        session.commit()
        return connection_settings(vm.ssh_enabled)
