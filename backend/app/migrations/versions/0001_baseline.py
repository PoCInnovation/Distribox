"""Baseline schema

Databases created before migrations already have these tables. For them,
table creation is skipped and the column fixes that startup used to apply
are run instead.

Revision ID: 0001
Revises:
Create Date: 2026-10-30

"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TABLES = (
    "users",
    "slaves",
    "vms",
    "events",
    "event_participants",
    "user_settings",
    "vm_credentials",
)

LEGACY_COLUMNS = (
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS policies "
    "JSON NOT NULL DEFAULT '[]'::json",
    "ALTER TABLE vms ADD COLUMN IF NOT EXISTS ssh_enabled "
    "BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE vms ADD COLUMN IF NOT EXISTS ssh_settings_revision "
    "INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE vms ADD COLUMN IF NOT EXISTS keyboard_layout VARCHAR",
    "ALTER TABLE vms ADD COLUMN IF NOT EXISTS slave_id UUID "
    "REFERENCES slaves(id)",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS ssh_enabled "
    "BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS keyboard_layout VARCHAR",
    "ALTER TABLE vm_credentials ADD COLUMN IF NOT EXISTS expires_at "
    "TIMESTAMPTZ",
)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("password", sa.String(), nullable=True),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("last_activity", sa.DateTime(timezone=True), nullable=True),
        sa.Column("policies", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index("ix_users_username", "users", ["username"],
                    unique=True, if_not_exists=True)

    op.create_table(
        "slaves",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("hostname", sa.String(), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("api_key", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_heartbeat", sa.DateTime(timezone=True),
                  nullable=True),
        sa.Column("total_cpu", sa.Integer(), nullable=False),
        sa.Column("total_mem", sa.Integer(), nullable=False),
        sa.Column("total_disk", sa.Integer(), nullable=False),
        sa.Column("available_cpu", sa.Float(), nullable=False),
        sa.Column("available_mem", sa.Float(), nullable=False),
        sa.Column("available_disk", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )

    op.create_table(
        "vms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("os", sa.String(), nullable=False),
        sa.Column("mem", sa.Integer(), nullable=False),
        sa.Column("vcpus", sa.Integer(), nullable=False),
        sa.Column("disk_size", sa.Integer(), nullable=False),
        sa.Column("ssh_enabled", sa.Boolean(), nullable=False),
        sa.Column("ssh_settings_revision", sa.Integer(), nullable=False),
        sa.Column("keyboard_layout", sa.String(), nullable=True),
        sa.Column("slave_id", sa.Uuid(), sa.ForeignKey("slaves.id"),
                  nullable=True),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )

    op.create_table(
        "events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("vm_os", sa.String(), nullable=False),
        sa.Column("vm_distribution", sa.String(), nullable=False),
        sa.Column("vm_mem", sa.Integer(), nullable=False),
        sa.Column("vm_vcpus", sa.Integer(), nullable=False),
        sa.Column("vm_disk_size", sa.Integer(), nullable=False),
        sa.Column("keyboard_layout", sa.String(), nullable=True),
        sa.Column("ssh_enabled", sa.Boolean(), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_vms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index("ix_events_slug", "events", ["slug"],
                    unique=True, if_not_exists=True)

    op.create_table(
        "event_participants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(),
                  sa.ForeignKey("events.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("participant_name", sa.String(), nullable=False),
        sa.Column("vm_id", sa.Uuid(),
                  sa.ForeignKey("vms.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )

    op.create_table(
        "user_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"),
                  nullable=False),
        sa.Column("default_vcpus", sa.Integer(), nullable=True),
        sa.Column("default_mem", sa.Integer(), nullable=True),
        sa.Column("default_disk_size", sa.Integer(), nullable=True),
        sa.Column("default_os", sa.String(), nullable=True),
        sa.Column("default_keyboard_layout", sa.String(), nullable=True),
        sa.Column("timezone", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index("ix_user_settings_user_id", "user_settings", ["user_id"],
                    unique=True, if_not_exists=True)

    op.create_table(
        "vm_credentials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vm_id", sa.Uuid(),
                  sa.ForeignKey("vms.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("password", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index("ix_vm_credentials_vm_id", "vm_credentials", ["vm_id"],
                    if_not_exists=True)

    for statement in LEGACY_COLUMNS:
        op.execute(statement)

    naive_columns = op.get_bind().execute(sa.text(
        "SELECT table_name, column_name FROM information_schema.columns "
        "WHERE table_schema = current_schema() "
        "AND data_type = 'timestamp without time zone'"
    )).all()
    for table, column in naive_columns:
        if table in TABLES:
            op.execute(
                f"ALTER TABLE {table} ALTER COLUMN {column} "
                f"TYPE TIMESTAMPTZ USING {column} AT TIME ZONE 'UTC'"
            )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
