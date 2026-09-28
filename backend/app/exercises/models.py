import uuid

from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UUIDPrimaryKey


class Exercise(UUIDPrimaryKey, Base):
    __tablename__ = "exercises"
    __table_args__ = (CheckConstraint("sets > 0", name="sets_positive"),)

    day_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workout_days.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    muscle_group: Mapped[str | None] = mapped_column(String(60))
    # Nullable: imported PDFs do not always state them; the user fills them in on preview.
    sets: Mapped[int | None] = mapped_column(SmallInteger)
    # Text, not int: plans prescribe schemes such as "8-12", "10/8/6" or "até à falha".
    reps: Mapped[str | None] = mapped_column(String(32))
    position: Mapped[int] = mapped_column(SmallInteger)
    notes: Mapped[str | None] = mapped_column(Text)
