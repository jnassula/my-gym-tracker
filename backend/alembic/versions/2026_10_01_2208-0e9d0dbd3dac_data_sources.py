"""data sources

One connection per user and source (Apple Health, Health Connect) instead of one per user, and
each sample remembers the source that sent it. Written by hand: autogenerate sees neither the
primary key's change nor the CHECK constraints.

The previous release keeps working on everything that exists when this runs: its inserts get
``apple_health`` from the defaults, and its upsert still finds ``uq_health_samples_user_type_time``
(left as it is on purpose). The one exception is an account that connects both sources and is
then rolled back: the old code reads a connection by ``user_id`` alone, finds two and fails on the
data sources screen until the release goes forward again. Nothing is lost.

Revision ID: 0e9d0dbd3dac
Revises: ca311ef21ba2
Create Date: 2026-10-01 22:08:53.678604

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0e9d0dbd3dac"
down_revision: str | Sequence[str] | None = "ca311ef21ba2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PROVIDERS = "('apple_health', 'health_connect')"


def _provider() -> sa.Enum:
    return sa.Enum(
        "apple_health", "health_connect", name="healthprovider", native_enum=False, length=16
    )


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "health_connections",
        sa.Column("provider", _provider(), server_default="apple_health", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_health_connections_provider"), "health_connections", f"provider IN {PROVIDERS}"
    )
    op.drop_constraint(op.f("pk_health_connections"), "health_connections", type_="primary")
    op.create_primary_key(
        op.f("pk_health_connections"), "health_connections", ["user_id", "provider"]
    )
    op.add_column(
        "health_samples",
        sa.Column("source", _provider(), server_default="apple_health", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_health_samples_source"), "health_samples", f"source IN {PROVIDERS}"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Back to one connection per user: what came from the other sources goes.
    op.execute("DELETE FROM health_samples WHERE source <> 'apple_health'")
    op.execute("DELETE FROM health_connections WHERE provider <> 'apple_health'")
    op.drop_constraint(op.f("ck_health_samples_source"), "health_samples", type_="check")
    op.drop_column("health_samples", "source")
    op.drop_constraint(op.f("pk_health_connections"), "health_connections", type_="primary")
    op.create_primary_key(op.f("pk_health_connections"), "health_connections", ["user_id"])
    op.drop_constraint(op.f("ck_health_connections_provider"), "health_connections", type_="check")
    op.drop_column("health_connections", "provider")
