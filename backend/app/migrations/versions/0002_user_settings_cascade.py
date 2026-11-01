"""Delete user settings with their user

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-30

"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("user_settings_user_id_fkey", "user_settings",
                       type_="foreignkey")
    op.create_foreign_key("user_settings_user_id_fkey", "user_settings",
                          "users", ["user_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    op.drop_constraint("user_settings_user_id_fkey", "user_settings",
                       type_="foreignkey")
    op.create_foreign_key("user_settings_user_id_fkey", "user_settings",
                          "users", ["user_id"], ["id"])
