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
from app.services.vm_service import VmService


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
    def create_event(payload: EventCreate, created_by: str) -> EventRead:
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

            for participant in participants:
                try:
                    VmService.remove_vm(str(participant.vm_id))
                except Exception:
                    pass
                session.delete(participant)

            session.delete(event)
            session.commit()

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

            try:
                VmService.remove_vm(str(parsed_vm_id))
            except Exception:
                pass

            session.delete(participant)
            session.commit()

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

        vm_create = VmCreate(
            name=vm_name,
            os=event.vm_os,
            mem=event.vm_mem,
            vcpus=event.vm_vcpus,
            disk_size=event.vm_disk_size,
            activate_at_start=True,
        )
        vm = VmService.create_vm(vm_create)

        credential_password = str(uuid.uuid4())[:12]
        credential = VmService.create_vm_credential(
            str(vm.id),
            VmCredentialCreateRequest(
                name=sanitized,
                password=credential_password,
            ),
        )

        with Session(engine) as session:
            participant = EventParticipantORM(
                event_id=event.id,
                participant_name=payload.participant_name,
                vm_id=vm.id,
            )
            session.add(participant)
            session.commit()

        return EventJoinResponse(
            vm_id=vm.id,
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
