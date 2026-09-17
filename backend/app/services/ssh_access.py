import logging
import secrets
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Session, select

from app.core.config import engine
from app.orm.event import EventORM, EventParticipantORM
from app.orm.vm import VmORM
from app.orm.vm_credential import VmCredentialORM
from app.utils.crypto import decrypt_secret

logger = logging.getLogger(__name__)


def credential_is_active(session: Session, credential: VmCredentialORM) -> bool:
    now = datetime.now(timezone.utc)
    if credential.expires_at:
        expires_at = credential.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            return False
    event = session.exec(
        select(EventORM)
        .join(EventParticipantORM, EventParticipantORM.event_id == EventORM.id)
        .where(EventParticipantORM.vm_id == credential.vm_id)
    ).first()
    if event is None:
        return True
    deadline = event.deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return deadline > now


def credential_matches(credential: VmCredentialORM, password: str) -> bool:
    try:
        return secrets.compare_digest(
            decrypt_secret(credential.password).encode(), password.encode()
        )
    except ValueError:
        return False


def find_credential(session: Session, password: str) -> VmCredentialORM | None:
    if not password or len(password) > 1024:
        return None
    matches = [
        credential for credential in session.exec(select(VmCredentialORM))
        if credential_matches(credential, password) and
        credential_is_active(session, credential)
    ]
    if len(matches) > 1:
        logger.warning("Rejected access secret shared by credentials %s",
                       ", ".join(str(credential.id) for credential in matches))
    return matches[0] if len(matches) == 1 else None


def authenticate_ssh(credential_id: str, password: str) -> str | None:
    try:
        parsed_id = UUID(credential_id)
    except ValueError:
        return None
    with Session(engine) as session:
        credential = session.get(VmCredentialORM, parsed_id)
        if not credential or not credential_matches(credential, password):
            return None
        vm = session.get(VmORM, credential.vm_id)
        if vm and vm.ssh_enabled and credential_is_active(session, credential):
            return str(vm.id)
    return None


def ssh_access_valid(credential_id: str, vm_id: str) -> bool:
    try:
        parsed_credential_id = UUID(credential_id)
        parsed_vm_id = UUID(vm_id)
    except ValueError:
        return False
    with Session(engine) as session:
        credential = session.get(VmCredentialORM, parsed_credential_id)
        if not credential or credential.vm_id != parsed_vm_id:
            return False
        vm = session.get(VmORM, parsed_vm_id)
        return bool(vm and vm.ssh_enabled and credential_is_active(session, credential))
