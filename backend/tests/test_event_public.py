import os
from datetime import datetime, timezone
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.orm.event import EventORM, EventParticipantORM
from app.orm.user import UserORM
from app.orm.vm import VmORM
from app.routes import event
from app.services import event_service
from app.utils.auth import get_current_user

os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")


@pytest.fixture
def workshop(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(event_service, "engine", engine)
    workshop = EventORM(
        name="Workshop", slug="workshop", vm_os="ubuntu-24.04.qcow2",
        vm_distribution="ubuntu", vm_mem=2, vm_vcpus=1, vm_disk_size=10,
        max_vms=3, created_by="organiser", ssh_enabled=True,
        deadline=datetime(2030, 1, 1, 12, tzinfo=timezone.utc),
    )
    event_id, vm_id = workshop.id, uuid4()
    with Session(engine) as session:
        session.add(workshop)
        session.add(VmORM(id=vm_id, name="workshop-ada-lovelace",
                          os="ubuntu-24.04.qcow2", mem=2, vcpus=1, disk_size=10))
        session.add(EventParticipantORM(
            event_id=event_id, vm_id=vm_id, participant_name="Ada Lovelace",
        ))
        session.commit()
    yield event_id, vm_id
    engine.dispose()


def api_client(user=None):
    app = FastAPI()
    app.include_router(event.router, prefix="/events")
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


def test_public_event_exposes_only_joining_details(workshop):
    response = api_client().get("/events/public/workshop")

    assert response.status_code == 200
    body = response.json()
    assert body.pop("deadline").startswith("2030-01-01T12:00:00")
    assert body == {
        "slug": "workshop", "name": "Workshop", "vm_os": "ubuntu-24.04.qcow2",
        "vm_distribution": "ubuntu", "vm_mem": 2, "vm_vcpus": 1,
        "vm_disk_size": 10, "max_vms": 3, "participants_count": 1,
    }


def test_event_details_keep_roster_for_authorised_users(workshop):
    event_id, vm_id = workshop
    organiser = UserORM(username="organiser", hashed_password="unused",
                        policies=["events:getById"])

    response = api_client(organiser).get(f"/events/{event_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["created_by"] == "organiser"
    assert body["participants_count"] == 1
    assert [(p["participant_name"], p["vm_id"]) for p in body["participants"]] \
        == [("Ada Lovelace", str(vm_id))]


def test_join_does_not_reveal_who_already_joined(workshop, monkeypatch):
    monkeypatch.setattr(event_service.EventService, "_pick_node_for_vm",
                        Mock(return_value=None))
    monkeypatch.setattr(event_service.VmService, "create_vm",
                        Mock(side_effect=lambda vm: {"id": uuid4()}))
    monkeypatch.setattr(event_service.VmService, "create_vm_credential",
                        Mock(return_value={"name": "ada-lovelace",
                                           "password": "secret"}))
    client = api_client()

    for name in ("Ada Lovelace", "ada lovelace"):
        response = client.post("/events/public/workshop/join",
                               json={"participant_name": name})
        assert response.status_code == 201
        assert response.json()["vm_name"] == "workshop-ada-lovelace"

    assert client.get("/events/public/workshop").json()[
        "participants_count"] == 3
