"""Service for managing slave nodes on the Master."""
import uuid
import logging
import secrets
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.config import engine
from app.orm.slave import SlaveORM
from app.models.slave import SlaveCreate, SlaveHeartbeat
from app.services.slave_client import slave_get_host_info

logger = logging.getLogger(__name__)

# Slaves with no heartbeat for this many seconds are considered offline
HEARTBEAT_TIMEOUT_SECONDS = 90


class SlaveService:

    @staticmethod
    def list_slaves() -> list[SlaveORM]:
        with Session(engine) as session:
            return list(session.exec(select(SlaveORM)).all())

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
            session.delete(slave)
            session.commit()

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
            slave.last_heartbeat = datetime.utcnow()
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
            logger.info("Slave %s (%s) reported graceful shutdown", slave.name, slave.id)

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
        now = datetime.utcnow()
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
