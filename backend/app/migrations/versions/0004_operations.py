"""Record long-running operations

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-18

"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("vm_id", sa.Uuid(), nullable=True),
        sa.Column("slave_id", sa.Uuid(), nullable=True),
        sa.Column("slave_name", sa.String(), nullable=True),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("phases", sa.JSON(), nullable=False),
        sa.Column("phase", sa.String(), nullable=False),
        sa.Column("phase_started_at", sa.DateTime(timezone=True),
                  nullable=False),
        sa.Column("bytes_done", sa.BigInteger(), nullable=True),
        sa.Column("bytes_total", sa.BigInteger(), nullable=True),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("operations")
