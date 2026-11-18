"""Long-running jobs users can watch: one row per job, updated as it runs.

Jobs run in threads of this process, and `_alive` holds the ones still
running here. A row left `running` by a thread that is gone, after a restart
for instance, is closed as `interrupted`. This relies on the backend being a
single process.
"""
import json
import logging
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional, TypeVar

from fastapi import HTTPException, status
from sqlmodel import Session, and_, col, delete, or_, select, update

from app.core.config import engine
from app.models.operation import OperationRead
from app.orm.operation import OperationORM
from app.orm.user import UserORM
from app.utils.auth import user_has_policy

logger = logging.getLogger(__name__)

T = TypeVar("T")

RUNNING = "running"
SUCCEEDED = "succeeded"
FAILED = "failed"
INTERRUPTED = "interrupted"

VM_CREATE = "vm.create"

# Seeing an operation takes the policy that starts one of its kind: its error
# and its author are not shown to users who can only read VMs.
KIND_POLICIES = {VM_CREATE: "vms:create"}

# How long a finished operation stays listed, unless it is dismissed first.
RETENTION = {
    SUCCEEDED: timedelta(hours=24),
    FAILED: timedelta(days=7),
    INTERRUPTED: timedelta(days=7),
}
MAX_FINISHED_LISTED = 50
PROGRESS_WRITE_INTERVAL = 1.0

_alive: set[uuid.UUID] = set()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _write(operation_id: uuid.UUID, **values: Any) -> None:
    """Update a running operation; a finished one never changes again.

    Best effort: losing a progress update must not fail the job.
    """
    try:
        with Session(engine) as session:
            session.exec(
                update(OperationORM)
                .where(col(OperationORM.id) == operation_id,
                       col(OperationORM.status) == RUNNING)
                .values(updated_at=_now(), **values)
            )
            session.commit()
    except Exception:
        logger.warning("Could not update operation %s", operation_id,
                       exc_info=True)


def _finish(operation_id: uuid.UUID, outcome: str,
            error: Optional[str] = None) -> None:
    _write(operation_id, status=outcome, error=error, finished_at=_now())


def describe_error(error: BaseException) -> str:
    if isinstance(error, HTTPException):
        detail = error.detail
        return detail if isinstance(detail, str) else json.dumps(detail)
    return str(error) or type(error).__name__


class Progress:
    """Where a job reports how far it is. This one ignores it."""

    def phase(self, phase: str, bytes_total: Optional[int] = None) -> None:
        """Enter a phase, measurable when `bytes_total` is given."""

    def advance(self, bytes_done: int) -> None:
        """Report the bytes done so far in the current phase."""

    def set_vm(self, vm_id: uuid.UUID) -> None:
        """Change which VM the job is about."""


NO_PROGRESS = Progress()


class OperationProgress(Progress):
    def __init__(self, operation_id: uuid.UUID):
        self._operation_id = operation_id
        self._lock = threading.Lock()
        self._written_at = time.monotonic()

    def phase(self, phase: str, bytes_total: Optional[int] = None) -> None:
        with self._lock:
            self._written_at = time.monotonic()
        _write(
            self._operation_id,
            phase=phase,
            phase_started_at=_now(),
            bytes_done=0 if bytes_total else None,
            bytes_total=bytes_total or None,
        )

    def advance(self, bytes_done: int) -> None:
        with self._lock:
            now = time.monotonic()
            if now - self._written_at < PROGRESS_WRITE_INTERVAL:
                return
            self._written_at = now
        _write(self._operation_id, bytes_done=bytes_done)

    def set_vm(self, vm_id: uuid.UUID) -> None:
        _write(self._operation_id, vm_id=vm_id)


def _visible_kinds(user: UserORM) -> list[str]:
    return [kind for kind, policy in KIND_POLICIES.items()
            if user_has_policy(user, policy)]


def _get_visible(session: Session, operation_id: uuid.UUID,
                 user: UserORM) -> OperationORM:
    operation = session.get(OperationORM, operation_id)
    if operation is None or operation.kind not in _visible_kinds(user):
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            f"Operation {operation_id} not found")
    return operation


class OperationService:
    @staticmethod
    def create(
        kind: str,
        name: str,
        phases: list[str],
        vm_id: Optional[uuid.UUID] = None,
        slave_id: Optional[uuid.UUID] = None,
        slave_name: Optional[str] = None,
        params: Optional[dict[str, Any]] = None,
        created_by: Optional[str] = None,
    ) -> OperationRead:
        """Record an operation as running. Its job must be run next."""
        OperationService.purge_expired()
        operation = OperationORM(
            kind=kind,
            name=name,
            phases=phases,
            phase=phases[0],
            vm_id=vm_id,
            slave_id=slave_id,
            slave_name=slave_name,
            params=params or {},
            created_by=created_by,
        )
        # Alive before the row exists, so it is never seen as an orphan.
        _alive.add(operation.id)
        try:
            with Session(engine) as session:
                session.add(operation)
                session.commit()
                session.refresh(operation)
                return OperationRead.model_validate(operation)
        except Exception:
            _alive.discard(operation.id)
            raise

    @staticmethod
    def run(operation_id: uuid.UUID, job: Callable[[Progress], T]) -> T:
        """Run the job in this thread and record how it ended."""
        try:
            result = job(OperationProgress(operation_id))
            _finish(operation_id, SUCCEEDED)
            return result
        except Exception as error:
            _finish(operation_id, FAILED, describe_error(error))
            raise
        finally:
            _alive.discard(operation_id)

    @staticmethod
    def run_in_background(operation_id: uuid.UUID,
                          job: Callable[[Progress], Any]) -> None:
        def target() -> None:
            try:
                OperationService.run(operation_id, job)
            except Exception:
                logger.exception("Operation %s failed", operation_id)

        # A daemon thread: a copy must not hold up the backend's shutdown.
        thread = threading.Thread(
            target=target, name=f"operation-{operation_id}", daemon=True)
        try:
            thread.start()
        except Exception as error:
            _finish(operation_id, FAILED, describe_error(error))
            _alive.discard(operation_id)
            raise

    @staticmethod
    def interrupt_orphans() -> None:
        """Close the running operations whose thread is gone."""
        with Session(engine) as session:
            running = session.exec(
                select(OperationORM.id).where(OperationORM.status == RUNNING)
            ).all()
            orphans = [operation_id for operation_id in running
                       if operation_id not in _alive]
            if not orphans:
                return
            now = _now()
            # Only rows still running: a job that ended meanwhile keeps its
            # own outcome.
            session.exec(
                update(OperationORM)
                .where(col(OperationORM.id).in_(orphans),
                       col(OperationORM.status) == RUNNING)
                .values(
                    status=INTERRUPTED,
                    error="The backend stopped before this finished.",
                    finished_at=now,
                    updated_at=now,
                )
            )
            session.commit()

    @staticmethod
    def purge_expired() -> None:
        now = _now()
        with Session(engine) as session:
            for outcome, kept_for in RETENTION.items():
                session.exec(
                    delete(OperationORM).where(
                        col(OperationORM.status) == outcome,
                        col(OperationORM.finished_at) < now - kept_for,
                    )
                )
            session.commit()

    @staticmethod
    def running_vm_ids() -> set[str]:
        """The VMs a running operation is still working on."""
        with Session(engine) as session:
            rows = session.exec(
                select(OperationORM.id, OperationORM.vm_id).where(
                    OperationORM.status == RUNNING,
                    col(OperationORM.vm_id).is_not(None),
                )
            ).all()
        return {str(vm_id) for operation_id, vm_id in rows
                if operation_id in _alive}

    @staticmethod
    def list_operations(user: UserORM) -> list[OperationRead]:
        """Running operations and recently finished ones, newest first."""
        kinds = _visible_kinds(user)
        if not kinds:
            return []
        OperationService.interrupt_orphans()
        now = _now()
        with Session(engine) as session:
            running = session.exec(
                select(OperationORM).where(
                    OperationORM.status == RUNNING,
                    col(OperationORM.kind).in_(kinds),
                )
            ).all()
            finished = session.exec(
                select(OperationORM)
                .where(
                    col(OperationORM.kind).in_(kinds),
                    or_(*(
                        and_(col(OperationORM.status) == outcome,
                             col(OperationORM.finished_at) >= now - kept_for)
                        for outcome, kept_for in RETENTION.items()
                    )),
                )
                .order_by(col(OperationORM.finished_at).desc())
                .limit(MAX_FINISHED_LISTED)
            ).all()
            # A job ending between the two queries shows up in both.
            operations = {operation.id: operation
                          for operation in [*running, *finished]}
            return [
                OperationRead.model_validate(operation)
                for operation in sorted(
                    operations.values(),
                    key=lambda operation: operation.created_at,
                    reverse=True,
                )
            ]

    @staticmethod
    def get_operation(operation_id: uuid.UUID,
                      user: UserORM) -> OperationRead:
        OperationService.interrupt_orphans()
        with Session(engine) as session:
            return OperationRead.model_validate(
                _get_visible(session, operation_id, user))

    @staticmethod
    def dismiss(operation_id: uuid.UUID, user: UserORM) -> None:
        OperationService.interrupt_orphans()
        with Session(engine) as session:
            operation = _get_visible(session, operation_id, user)
            if operation.status == RUNNING:
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    "This operation is still running")
            session.delete(operation)
            session.commit()
