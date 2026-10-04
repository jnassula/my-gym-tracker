"""exercise demos

Revision ID: 4fd6fdea4375
Revises: 4dabd50754f6
Create Date: 2026-10-04 21:58:21.538486

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "4fd6fdea4375"
down_revision: str | Sequence[str] | None = "4dabd50754f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Two tables of their own, nothing of a user's: the previous release doesn't know them and
    # needs nothing from them.
    op.create_table(
        "exercise_demos",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("body_parts", postgresql.ARRAY(sa.String(length=60)), nullable=False),
        sa.Column("equipments", postgresql.ARRAY(sa.String(length=60)), nullable=False),
        sa.Column("target_muscles", postgresql.ARRAY(sa.String(length=60)), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exercise_demos")),
    )
    op.create_table(
        "exercise_demo_links",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("muscle_group", sa.String(length=16), nullable=False),
        sa.Column("demo_id", sa.String(length=32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["demo_id"],
            ["exercise_demos.id"],
            name=op.f("fk_exercise_demo_links_demo_id_exercise_demos"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("name", "muscle_group", name=op.f("pk_exercise_demo_links")),
    )
    op.create_index(
        op.f("ix_exercise_demo_links_demo_id"), "exercise_demo_links", ["demo_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_exercise_demo_links_demo_id"), table_name="exercise_demo_links")
    op.drop_table("exercise_demo_links")
    op.drop_table("exercise_demos")
