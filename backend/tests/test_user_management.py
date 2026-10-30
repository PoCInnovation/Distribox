import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.orm.user import UserORM
from app.orm.user_settings import UserSettingsORM
from app.routes import user_management
from app.utils.auth import get_current_user

os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")


@pytest.fixture
def db_engine(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(user_management, "engine", engine)
    yield engine
    engine.dispose()


def api_client():
    app = FastAPI()
    app.include_router(user_management.router)
    app.dependency_overrides[get_current_user] = lambda: UserORM(
        username="admin", hashed_password="unused", is_admin=True,
    )
    return TestClient(app)


def add_user(engine, with_settings):
    user = UserORM(username="alice", hashed_password="unused")
    user_id = user.id
    with Session(engine) as session:
        session.add(user)
        if with_settings:
            session.add(UserSettingsORM(
                user_id=user_id, default_vcpus=2, timezone="Europe/Paris",
            ))
        session.commit()
    return user_id


def test_delete_user_with_saved_settings_removes_settings(db_engine):
    user_id = add_user(db_engine, with_settings=True)

    response = api_client().delete(f"/user/{user_id}")

    assert response.status_code == 200
    assert response.json() == {
        "message": 'User "alice" deleted successfully',
    }
    with Session(db_engine) as session:
        assert session.get(UserORM, user_id) is None
        settings = session.exec(
            select(UserSettingsORM).where(
                UserSettingsORM.user_id == user_id
            )
        ).all()
        assert settings == []


def test_deleting_user_record_cascades_to_saved_settings(db_engine):
    user_id = add_user(db_engine, with_settings=True)

    with Session(db_engine) as session:
        session.delete(session.get(UserORM, user_id))
        session.commit()

    with Session(db_engine) as session:
        assert session.get(UserORM, user_id) is None
        settings = session.exec(
            select(UserSettingsORM).where(
                UserSettingsORM.user_id == user_id
            )
        ).all()
        assert settings == []


def test_delete_user_without_saved_settings_succeeds(db_engine):
    user_id = add_user(db_engine, with_settings=False)

    response = api_client().delete(f"/user/{user_id}")

    assert response.status_code == 200
    assert response.json() == {
        "message": 'User "alice" deleted successfully',
    }
    with Session(db_engine) as session:
        assert session.get(UserORM, user_id) is None
