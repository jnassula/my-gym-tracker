"""activities

Revision ID: 870c1aab0e01
Revises: 8073672d586e
Create Date: 2026-10-05 19:27:09.289921

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "870c1aab0e01"
down_revision: str | Sequence[str] | None = "8073672d586e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Two tables of their own: the previous release doesn't know them and needs nothing of them.
    op.create_table(
        "activities",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column(
            "weekdays", sa.ARRAY(sa.SmallInteger()), server_default=sa.text("'{}'"), nullable=False
        ),
        sa.Column("weekdays_since", sa.Date(), nullable=True),
        sa.Column(
            "avoid", sa.ARRAY(sa.String(length=8)), server_default=sa.text("'{}'"), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "avoid <@ ARRAY['upper','lower','core']::varchar[]",
            name=op.f("ck_activities_avoid_valid"),
        ),
        sa.CheckConstraint(
            "weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]",
            name=op.f("ck_activities_weekdays_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_activities_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_activities")),
    )
    op.create_index(op.f("ix_activities_user_id"), "activities", ["user_id"], unique=False)
    op.create_table(
        "activity_days",
        sa.Column("activity_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("skipped", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["activity_id"],
            ["activities.id"],
            name=op.f("fk_activity_days_activity_id_activities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_activity_days_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_activity_days")),
    )
    op.create_index(
        "ix_activity_days_user_date", "activity_days", ["user_id", "local_date"], unique=False
    )
    op.create_index(
        "uq_activity_days_activity_date",
        "activity_days",
        ["activity_id", "local_date"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_activity_days_activity_date", table_name="activity_days")
    op.drop_index("ix_activity_days_user_date", table_name="activity_days")
    op.drop_table("activity_days")
    op.drop_index(op.f("ix_activities_user_id"), table_name="activities")
    op.drop_table("activities")
