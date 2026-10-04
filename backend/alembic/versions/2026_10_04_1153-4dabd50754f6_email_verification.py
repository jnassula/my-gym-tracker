"""email verification

Revision ID: 4dabd50754f6
Revises: 54728e4622b2
Create Date: 2026-10-04 11:53:43.472542

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4dabd50754f6"
down_revision: str | Sequence[str] | None = "54728e4622b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # The default keeps the previous release working after a rollback: an account it creates,
    # not knowing the column, counts as confirmed (as every account did). Only the new sign-up
    # writes a null. Drop the default in a later release.
    op.add_column(
        "users",
        sa.Column(
            "email_verified_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    )
    # Nobody who already has an account is asked to confirm it: confirmed since they joined.
    op.execute("UPDATE users SET email_verified_at = created_at")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "email_verified_at")
