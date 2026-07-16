"""add last_schedule_slot to push_jobs

Revision ID: a1b2c3d4e5f6
Revises: 0e6a8b1c437e
Create Date: 2026-07-16 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "0e6a8b1c437e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "push_jobs",
        sa.Column("last_schedule_slot", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("push_jobs", "last_schedule_slot")
