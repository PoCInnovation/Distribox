"""Service for managing slave nodes on the Master."""
import uuid
import logging
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import HTTPException, status
from sqlmodel import Session, select, col, delete

from app.core.config import engine
from app.orm.slave import SlaveORM
from app.orm.vm import VmORM
from app.orm.vm_credential import VmCredentialORM
from app.models.slave import SlaveCreate, SlaveHeartbeat
from app.services.slave_client import slave_get_vm, slave_list_vms, slave_stop_vm
from app.services.vm_service import VmService

logger = logging.getLogger(__name__)

# Slaves with no heartbeat for this many seconds are considered offline
HEARTBEAT_TIMEOUT_SECONDS = 90


class SlaveService:

    @staticmethod
    def list_slaves() -> list[SlaveORM]:
        with Session(engine) as session:
            return list(session.exec(select(SlaveORM).order_by(col(SlaveORM.created_at))).all())

    @staticmethod
    def get_slave(slave_id: str) -> SlaveORM:
        try:
            parsed_id = uuid.UUID(slave_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid slave id",
            ) from exc
        with Session(engine) as session:
            slave = session.get(SlaveORM, parsed_id)
            if not slave:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Slave {slave_id} not found",
                )
            return slave

    @staticmethod
    def create_slave(payload: SlaveCreate) -> SlaveORM:
        api_key = secrets.token_urlsafe(32)
        slave = SlaveORM(
            name=payload.name,
            hostname=payload.hostname,
            port=payload.port,
            api_key=api_key,
            status="offline",
        )
        with Session(engine) as session:
            session.add(slave)
            session.commit()
            session.refresh(slave)
            return slave

    @staticmethod
    def delete_slave(slave_id: str) -> None:
        """Stop the slave's VMs, then forget them. Disks and definitions stay
        on the slave, so its VMs can be adopted again after re-registering."""
        slave = SlaveService.get_slave(slave_id)
        with Session(engine) as session:
            vms = session.exec(
                select(VmORM).where(VmORM.slave_id == slave.id)).all()
        with ThreadPoolExecutor() as pool:
            failures = [failure for failure in pool.map(
                lambda vm: _stop_slave_vm(slave, vm), vms) if failure]
        if failures:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Could not stop {len(failures)} of {len(vms)} VMs on "
                    f"{slave.name}, so nothing was unregistered. Fix them and "
                    f"retry: {'; '.join(failures)}"
                ),
            )
        with Session(engine) as session:
            slave_vm_ids = select(VmORM.id).where(VmORM.slave_id == slave.id)
            session.exec(delete(VmCredentialORM).where(
                col(VmCredentialORM.vm_id).in_(slave_vm_ids)))
            session.exec(delete(VmORM).where(
                col(VmORM.slave_id) == slave.id))
            session.exec(delete(SlaveORM).where(col(SlaveORM.id) == slave.id))
            session.commit()

    @staticmethod
    def list_unmanaged_vms(slave_id: str) -> list[dict]:
        """Distribox VMs on the slave that this master does not manage."""
        slave = SlaveService.get_slave(slave_id)
        vms = slave_list_vms(slave)
        with Session(engine) as session:
            managed = set(session.exec(select(VmORM.id).where(
                col(VmORM.id).in_([uuid.UUID(vm["id"]) for vm in vms]))).all())
        return [vm for vm in vms if uuid.UUID(vm["id"]) not in managed]

    @staticmethod
    def adopt_vm(slave_id: str, vm_id: str) -> dict:
        """Manage an existing slave VM again, without any access to it."""
        slave = SlaveService.get_slave(slave_id)
        parsed_vm_id = VmService._parse_vm_id(vm_id)
        with Session(engine) as session:
            if session.get(VmORM, parsed_vm_id):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This VM is already managed by this master",
                )
        data = slave_get_vm(slave, vm_id)
        with Session(engine) as session:
            session.add(VmORM(
                id=parsed_vm_id,
                name=data["name"],
                os=data["os"],
                mem=data["mem"],
                vcpus=data["vcpus"],
                disk_size=data["disk_size"],
                keyboard_layout=data.get("keyboard_layout"),
                slave_id=slave.id,
            ))
            session.commit()
        return VmService._with_slave_fields(data, slave, vm_id)

    @staticmethod
    def handle_heartbeat(slave_id: str, heartbeat: SlaveHeartbeat) -> SlaveORM:
        try:
            parsed_id = uuid.UUID(slave_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid slave id",
            ) from exc
        with Session(engine) as session:
            slave = session.get(SlaveORM, parsed_id)
            if not slave:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Slave {slave_id} not found",
                )
            slave.status = "online"
            slave.last_heartbeat = datetime.now(timezone.utc)
            slave.total_cpu = heartbeat.total_cpu
            slave.total_mem = heartbeat.total_mem
            slave.total_disk = heartbeat.total_disk
            slave.available_cpu = heartbeat.available_cpu
            slave.available_mem = heartbeat.available_mem
            slave.available_disk = heartbeat.available_disk
            session.add(slave)
            session.commit()
            session.refresh(slave)
            return slave

    @staticmethod
    def mark_slave_offline(slave_id: str) -> None:
        try:
            parsed_id = uuid.UUID(slave_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid slave id",
            ) from exc
        with Session(engine) as session:
            slave = session.get(SlaveORM, parsed_id)
            if not slave:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Slave {slave_id} not found",
                )
            slave.status = "offline"
            session.add(slave)
            session.commit()
            logger.info("Slave %s (%s) reported graceful shutdown",
                        slave.name, slave.id)

    @staticmethod
    def get_online_slaves() -> list[SlaveORM]:
        with Session(engine) as session:
            slaves = session.exec(
                select(SlaveORM).where(SlaveORM.status == "online")
            ).all()
            return list(slaves)

    @staticmethod
    def pick_slave(
        required_mem: int,
        required_vcpus: int,
        preferred_slave_id: Optional[str] = None,
    ) -> SlaveORM:
        """Pick the best slave for a new VM using least-loaded strategy.

        If preferred_slave_id is given and the slave is online, use it.
        Otherwise pick the online slave with the most available memory.
        """
        if preferred_slave_id:
            slave = SlaveService.get_slave(preferred_slave_id)
            if slave.status == "online":
                return slave
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Slave {preferred_slave_id} is not online",
            )

        online_slaves = SlaveService.get_online_slaves()
        if not online_slaves:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="No online slaves available",
            )

        # Least-loaded: pick slave with most available memory
        best = max(online_slaves, key=lambda s: s.available_mem)
        return best

    @staticmethod
    def check_stale_slaves() -> None:
        """Mark slaves as offline if their heartbeat is too old."""
        now = datetime.now(timezone.utc)
        with Session(engine) as session:
            online_slaves = session.exec(
                select(SlaveORM).where(SlaveORM.status == "online")
            ).all()
            for slave in online_slaves:
                if slave.last_heartbeat is None:
                    slave.status = "offline"
                    session.add(slave)
                    continue
                delta = (now - slave.last_heartbeat).total_seconds()
                if delta > HEARTBEAT_TIMEOUT_SECONDS:
                    slave.status = "offline"
                    session.add(slave)
                    logger.info(
                        "Marked slave %s (%s) as offline (no heartbeat for %ds)",
                        slave.name, slave.id, delta,
                    )
            session.commit()


def _stop_slave_vm(slave: SlaveORM, vm: VmORM) -> Optional[str]:
    """Stop a VM on its slave. Returns why it is not stopped, if it is not."""
    try:
        state = slave_stop_vm(slave, str(vm.id)).get("state")
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            return None
        return f"{vm.name}: {exc.detail}"
    except httpx.HTTPError:
        return f"{vm.name}: slave unreachable"
    return None if state == "Stopped" else f"{vm.name}: still {state}"
