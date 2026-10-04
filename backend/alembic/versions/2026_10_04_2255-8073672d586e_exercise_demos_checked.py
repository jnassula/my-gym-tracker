"""exercise demos checked

Revision ID: 8073672d586e
Revises: 4fd6fdea4375
Create Date: 2026-10-04 22:55:56.186207

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8073672d586e"
down_revision: str | Sequence[str] | None = "4fd6fdea4375"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # A nullable column the previous release doesn't read: when the source answered for an
    # animation. What is already copied was answered; the rest is asked for once more by the
    # server's own run, which then knows what the source doesn't have.
    op.add_column(
        "exercise_demos", sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute("UPDATE exercise_demos SET checked_at = created_at WHERE size_bytes IS NOT NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("exercise_demos", "checked_at")
