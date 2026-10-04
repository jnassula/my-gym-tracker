from datetime import datetime

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt


class ExerciseDemo(CreatedAt, Base):
    """One exercise of the animation catalogue (ExerciseDB's free dataset), as its source
    describes it. Its GIF is in the object storage at ``demos/<id>.gif`` once ``size_bytes``
    says so. Nothing here belongs to a user."""

    __tablename__ = "exercise_demos"

    # The source's own id.
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))  # English, as the source names it
    body_parts: Mapped[list[str]] = mapped_column(ARRAY(String(60)))
    equipments: Mapped[list[str]] = mapped_column(ARRAY(String(60)))
    target_muscles: Mapped[list[str]] = mapped_column(ARRAY(String(60)))
    # Null: catalogued, the animation not copied yet (it isn't offered until it is).
    size_bytes: Mapped[int | None]
    # When the source answered for this animation: with the file, or that it has none. Null:
    # never asked (or it didn't answer), which is what a server still has to fetch by itself.
    checked_at: Mapped[datetime | None]


class ExerciseDemoLink(CreatedAt, Base):
    """Which animation shows an exercise, decided once per exercise key (the name as a plan
    writes it, lower-cased, and its muscle group) and shared by every plan that has it.
    ``demo_id`` null: it was looked for and nothing in the catalogue is that movement."""

    __tablename__ = "exercise_demo_links"

    # Text, not the exercise's 120 characters: lower-casing can lengthen a name.
    name: Mapped[str] = mapped_column(Text, primary_key=True)
    # "" for an exercise without a group (a primary key takes no null).
    muscle_group: Mapped[str] = mapped_column(String(16), primary_key=True)
    demo_id: Mapped[str | None] = mapped_column(
        ForeignKey("exercise_demos.id", ondelete="SET NULL"), index=True
    )
