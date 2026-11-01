"""Drop the event participant VM foreign key

A VM outlives its master record while its slave is unregistered.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-31

"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE event_participants "
        "DROP CONSTRAINT IF EXISTS event_participants_vm_id_fkey"
    )


def downgrade() -> None:
    op.create_foreign_key("event_participants_vm_id_fkey",
                          "event_participants", "vms", ["vm_id"], ["id"],
                          ondelete="CASCADE")
