import logging
import re
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlmodel import Session, select, func

from app.core.config import engine
from app.models.event import (
    EventCreate, EventUpdate, EventRead,
    EventJoinRequest, EventJoinResponse, EventParticipantRead,
)
from app.models.vm import VmCreate, VmCredentialCreateRequest
from app.orm.event import EventORM, EventParticipantORM
from app.orm.vm import VmORM
from app.orm.vm_credential import VmCredentialORM
from app.services.host_service import HostService
from app.services.vm_service import VmService
from app.services.slave_service import SlaveService
from app.services.slave_client import slave_get_host_info

logger = logging.getLogger(__name__)


def _sanitize_name(name: str) -> str:
    sanitized = re.sub(r"[^a-z0-9-]", "-", name.lower().strip())
    sanitized = re.sub(r"-+", "-", sanitized).strip("-")
    return sanitized or "participant"


def _event_to_read(event: EventORM, participants: list[EventParticipantORM] | None = None) -> EventRead:
    with Session(engine) as session:
        count_stmt = select(func.count()).where(
            EventParticipantORM.event_id == event.id
        )
        count = session.exec(count_stmt).one()

        participant_reads = []
        if participants is not None:
            participant_reads = [
                EventParticipantRead(
                    id=p.id,
                    participant_name=p.participant_name,
                    vm_id=p.vm_id,
                    created_at=p.created_at,
                )
                for p in participants
            ]

    return EventRead(
        id=event.id,
        slug=event.slug,
        name=event.name,
        vm_os=event.vm_os,
        vm_distribution=event.vm_distribution,
        vm_mem=event.vm_mem,
        vm_vcpus=event.vm_vcpus,
        vm_disk_size=event.vm_disk_size,
        keyboard_layout=event.keyboard_layout,
        deadline=event.deadline,
        max_vms=event.max_vms,
        created_at=event.created_at,
        created_by=event.created_by,
        participants_count=count,
        participants=participant_reads,
    )


class EventService:
    @staticmethod
    def list_events() -> list[EventRead]:
        with Session(engine) as session:
            events = session.exec(
                select(EventORM).order_by(EventORM.created_at.desc())
            ).all()
            return [_event_to_read(e) for e in events]

    @staticmethod
    def get_event(event_id: str) -> EventRead:
        with Session(engine) as session:
            parsed_id = _parse_uuid(event_id)
            event = session.get(EventORM, parsed_id)
            if not event:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f"Event {event_id} not found")
            participants = session.exec(
                select(EventParticipantORM)
                .where(EventParticipantORM.event_id == event.id)
                .order_by(EventParticipantORM.created_at)
            ).all()
            return _event_to_read(event, list(participants))

    @staticmethod
    def get_event_by_slug(slug: str) -> EventRead:
        with Session(engine) as session:
            event = session.exec(
                select(EventORM).where(EventORM.slug == slug)
            ).first()
            if not event:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f"Event '{slug}' not found")
            participants = session.exec(
                select(EventParticipantORM)
                .where(EventParticipantORM.event_id == event.id)
                .order_by(EventParticipantORM.created_at)
            ).all()
            return _event_to_read(event, list(participants))

    @staticmethod
    def _get_cluster_resources() -> dict:
        """Get aggregated resources across master and all online slaves."""
        master = HostService.get_host_info()
        total_cpu = master.cpu.cpu_count
        total_mem_available = master.mem.available
        total_disk_available = master.disk.available
        max_cpu_per_node = master.cpu.cpu_count

        for slave in SlaveService.get_online_slaves():
            try:
                info = slave_get_host_info(slave)
                total_cpu += info.get("cpu", {}).get("cpu_count", 0)
                total_mem_available += info.get("mem", {}).get("available", 0)
                total_disk_available += info.get("disk",
                                                 {}).get("available", 0)
                node_cpus = info.get("cpu", {}).get("cpu_count", 0)
                if node_cpus > max_cpu_per_node:
                    max_cpu_per_node = node_cpus
            except Exception:
                pass

        return {
            "total_cpu": total_cpu,
            "max_cpu_per_node": max_cpu_per_node,
            "mem_available": round(total_mem_available, 2),
            "disk_available": round(total_disk_available, 2),
        }

    @staticmethod
    def _check_host_resources(payload: EventCreate) -> None:
        cluster = EventService._get_cluster_resources()

        if payload.vm_vcpus > cluster["max_cpu_per_node"]:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Requested {payload.vm_vcpus} vCPUs per VM but no node has more than "
                f"{cluster['max_cpu_per_node']} CPU cores",
            )

        total_mem = payload.max_vms * payload.vm_mem
        if total_mem > cluster["mem_available"]:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Event requires up to {total_mem} GB RAM ({payload.max_vms} VMs x {payload.vm_mem} GB) "
                f"but only {cluster['mem_available']} GB is available across the cluster",
            )

        total_disk = payload.max_vms * payload.vm_disk_size
        if total_disk > cluster["disk_available"]:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Event requires up to {total_disk} GB disk ({payload.max_vms} VMs x {payload.vm_disk_size} GB) "
                f"but only {cluster['disk_available']} GB is available across the cluster",
            )

    @staticmethod
    def _pick_node_for_vm(required_mem: int, required_vcpus: int, required_disk: int):
        """Pick the best node for a new VM, prioritizing master.

        Returns None for master, or slave UUID for a slave node.
        """
        # Check master first
        try:
            master = HostService.get_host_info()
            if (master.mem.available >= required_mem and
                    master.cpu.cpu_count >= required_vcpus and
                    master.disk.available >= required_disk):
                return None  # Use master
        except Exception:
            logger.warning("Failed to check master resources")

        # Fall back to slaves, pick the one with most available memory
        online_slaves = SlaveService.get_online_slaves()
        best_slave = None
        best_mem = -1

        for slave in online_slaves:
            try:
                info = slave_get_host_info(slave)
                slave_mem = info.get("mem", {}).get("available", 0)
                slave_cpu = info.get("cpu", {}).get("cpu_count", 0)
                slave_disk = info.get("disk", {}).get("available", 0)
                if (slave_mem >= required_mem and
                        slave_cpu >= required_vcpus and
                        slave_disk >= required_disk and
                        slave_mem > best_mem):
                    best_slave = slave
                    best_mem = slave_mem
            except Exception:
                continue

        if best_slave:
            return best_slave.id

        # No node has enough resources; let master handle it (will fail naturally)
        return None

    @staticmethod
    def create_event(payload: EventCreate, created_by: str) -> EventRead:
        EventService._check_host_resources(payload)

        with Session(engine) as session:
            existing = session.exec(
                select(EventORM).where(EventORM.slug == payload.slug)
            ).first()
            if existing:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Event with slug '{payload.slug}' already exists",
                )

            event = EventORM(
                slug=payload.slug,
                name=payload.name,
                vm_os=payload.vm_os,
                vm_distribution=payload.vm_distribution,
                vm_mem=payload.vm_mem,
                vm_vcpus=payload.vm_vcpus,
                vm_disk_size=payload.vm_disk_size,
                keyboard_layout=payload.keyboard_layout,
                deadline=payload.deadline,
                max_vms=payload.max_vms,
                created_by=created_by,
            )
            session.add(event)
            session.commit()
            session.refresh(event)
            return _event_to_read(event)

    @staticmethod
    def update_event(event_id: str, payload: EventUpdate) -> EventRead:
        with Session(engine) as session:
            parsed_id = _parse_uuid(event_id)
            event = session.get(EventORM, parsed_id)
            if not event:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f"Event {event_id} not found")

            update_data = payload.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(event, key, value)

            # If deadline changed, update expires_at on all participant credentials
            if "deadline" in update_data:
                new_deadline = update_data["deadline"]
                participants = session.exec(
                    select(EventParticipantORM)
                    .where(EventParticipantORM.event_id == event.id)
                ).all()
                for participant in participants:
                    credentials = session.exec(
                        select(VmCredentialORM)
                        .where(VmCredentialORM.vm_id == participant.vm_id)
                    ).all()
                    for cred in credentials:
                        cred.expires_at = new_deadline
                        session.add(cred)

            session.add(event)
            session.commit()
            session.refresh(event)

            participants = session.exec(
                select(EventParticipantORM)
                .where(EventParticipantORM.event_id == event.id)
                .order_by(EventParticipantORM.created_at)
            ).all()
            return _event_to_read(event, list(participants))

    @staticmethod
    def delete_event(event_id: str) -> None:
        with Session(engine) as session:
            parsed_id = _parse_uuid(event_id)
            event = session.get(EventORM, parsed_id)
            if not event:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f"Event {event_id} not found")

            participants = session.exec(
                select(EventParticipantORM)
                .where(EventParticipantORM.event_id == event.id)
            ).all()

            vm_ids = [str(p.vm_id) for p in participants]

            for participant in participants:
                session.delete(participant)

            session.delete(event)
            session.commit()

        for vm_id in vm_ids:
            try:
                VmService.remove_vm(vm_id)
            except Exception:
                pass

    @staticmethod
    def delete_event_vm(event_id: str, vm_id: str) -> None:
        with Session(engine) as session:
            parsed_event_id = _parse_uuid(event_id)
            parsed_vm_id = _parse_uuid(vm_id)

            event = session.get(EventORM, parsed_event_id)
            if not event:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f"Event {event_id} not found")

            participant = session.exec(
                select(EventParticipantORM).where(
                    EventParticipantORM.event_id == parsed_event_id,
                    EventParticipantORM.vm_id == parsed_vm_id,
                )
            ).first()
            if not participant:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    "Participant VM not found in this event")

            session.delete(participant)
            session.commit()

        try:
            VmService.remove_vm(str(parsed_vm_id))
        except Exception:
            pass

    @staticmethod
    def join_event(slug: str, payload: EventJoinRequest) -> EventJoinResponse:
        with Session(engine) as session:
            event = session.exec(
                select(EventORM).where(EventORM.slug == slug)
            ).first()
            if not event:
                raise HTTPException(status.HTTP_404_NOT_FOUND,
                                    f"Event '{slug}' not found")

            if datetime.utcnow() > event.deadline:
                raise HTTPException(status.HTTP_410_GONE,
                                    "This event has expired")

            participants_count = session.exec(
                select(func.count()).where(
                    EventParticipantORM.event_id == event.id
                )
            ).one()

            if participants_count >= event.max_vms:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "This event has reached its maximum number of participants",
                )

            sanitized = _sanitize_name(payload.participant_name)
            vm_name = f"{event.slug}-{sanitized}"

            existing = session.exec(
                select(EventParticipantORM).where(
                    EventParticipantORM.event_id == event.id,
                    EventParticipantORM.participant_name == payload.participant_name,
                )
            ).first()
            if existing:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "A participant with this name already exists in this event",
                )

            existing_vm = session.exec(
                select(VmORM).where(VmORM.name == vm_name)
            ).first()
            if existing_vm:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"A VM with name '{vm_name}' already exists",
                )

        slave_id = EventService._pick_node_for_vm(
            event.vm_mem, event.vm_vcpus, event.vm_disk_size)
        vm_create = VmCreate(
            name=vm_name,
            os=event.vm_os,
            mem=event.vm_mem,
            vcpus=event.vm_vcpus,
            disk_size=event.vm_disk_size,
            keyboard_layout=event.keyboard_layout,
            activate_at_start=True,
            slave_id=slave_id,
        )
        vm = VmService.create_vm(vm_create)

        # create_vm returns a Vm object (local) or a dict (slave)
        vm_id = vm["id"] if isinstance(vm, dict) else vm.id

        credential_password = str(uuid.uuid4())[:12]
        credential = VmService.create_vm_credential(
            str(vm_id),
            VmCredentialCreateRequest(
                name=sanitized,
                password=credential_password,
                expires_at=event.deadline,
            ),
        )

        with Session(engine) as session:
            participant = EventParticipantORM(
                event_id=event.id,
                participant_name=payload.participant_name,
                vm_id=vm_id,
            )
            session.add(participant)
            session.commit()

        return EventJoinResponse(
            vm_id=vm_id,
            vm_name=vm_name,
            credential_name=credential["name"],
            credential_password=credential["password"],
        )


def _parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ID format",
        ) from exc
