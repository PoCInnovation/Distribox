from alembic import context
from sqlmodel import SQLModel

from app.core.config import engine
from app.orm import event, slave, user, user_settings, vm, vm_credential  # noqa: F401

with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=SQLModel.metadata)
    with context.begin_transaction():
        context.run_migrations()
