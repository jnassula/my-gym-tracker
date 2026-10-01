"""administrators

Revision ID: ca311ef21ba2
Revises: 13c889359b01
Create Date: 2026-10-01 21:04:59.426831

"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ca311ef21ba2"
down_revision: str | Sequence[str] | None = "13c889359b01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    # Until now the administrators were the addresses in ADMIN_EMAILS. Their accounts keep the
    # backoffice: this is the one and only time that variable is read.
    listed = [email.strip().lower() for email in os.environ.get("ADMIN_EMAILS", "").split(",")]
    emails = [email for email in listed if email]
    if emails:
        users = sa.table("users", sa.column("email", sa.String), sa.column("is_admin", sa.Boolean))
        op.execute(users.update().where(users.c.email.in_(emails)).values(is_admin=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "is_admin")
