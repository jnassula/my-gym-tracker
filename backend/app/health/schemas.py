"""Request/response schemas for the health domain."""

from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    model_validator,
)

from app.health.metrics import Sample, spread
from app.health.models import HealthProvider, HealthSampleType

# One shortcut run sends a few days of samples; this is far above that.
MAX_SAMPLES = 50_000
# Values outside these are sensor glitches: they are dropped, not refused (the bridge would
# resend them on every run).
HEART_RATE_RANGE = (25.0, 250.0)
CALORIES_RANGE = (0.0, 2_000.0)


class HealthSettings(BaseModel):
    """What the app keeps from a source ("O que lemos do relógio")."""

    model_config = ConfigDict(from_attributes=True)

    heart_rate: bool = True
    calories: bool = True
    # Weighings (weight and body fat), which go to the body domain, not to a session.
    body: bool = True


class HealthSettingsUpdate(BaseModel):
    heart_rate: bool | None = None
    calories: bool | None = None
    body: bool | None = None

    @model_validator(mode="after")
    def _something_to_change(self) -> Self:
        if not self.model_fields_set or any(
            getattr(self, field) is None for field in self.model_fields_set
        ):
            raise ValueError("Send at least one setting, none null")
        return self


class ConnectionRead(BaseModel):
    provider: HealthProvider
    connected: bool
    last_sync_at: datetime | None
    settings: HealthSettings


class HealthOverview(BaseModel):
    """Every source, connected or not, in the order the screen lists them."""

    connections: list[ConnectionRead]
    # This week (Monday to Sunday, the user's time zone): sessions, and those with watch data.
    week_sessions: int
    week_synced: int


class HealthRead(BaseModel):
    """Apple Health alone, as the app read it before there were other sources."""

    connected: bool
    last_sync_at: datetime | None
    settings: HealthSettings
    week_sessions: int
    week_synced: int


class HealthToken(BaseModel):
    """Shown once, to paste into the bridge."""

    token: str


def _as_list(value: object) -> object:
    """A list, or the Shortcuts app's text of one item per line (a list variable in a Text field
    of a JSON body). A lone item arrives as itself, and none as nothing."""
    if value is None:
        return []
    if isinstance(value, str):
        return [line for line in value.splitlines() if line.strip()]
    return value if isinstance(value, list) else [value]


Texts = Annotated[
    list[str | float],
    BeforeValidator(_as_list),
    Field(default_factory=list, max_length=MAX_SAMPLES),
]


def _number(text: str | float) -> float:
    """ "142", "56.80", "56,80" (a comma where the iPhone's region uses one) or a JSON number."""
    if isinstance(text, float | int):
        return float(text)
    cleaned = text.strip().replace("\u00a0", "").replace(" ", "")
    if "," in cleaned:
        decimal = "," if cleaned.rfind(",") > cleaned.rfind(".") else "."
        thousands = "." if decimal == "," else ","
        cleaned = cleaned.replace(thousands, "").replace(decimal, ".")
    return float(cleaned)


def _instant(text: str | float) -> datetime:
    """Format Date's ISO 8601 with time: "2026-09-29T18:02:05+01:00"."""
    instant = datetime.fromisoformat(str(text).strip())
    if instant.tzinfo is None:
        raise ValueError("an ISO 8601 date with time and offset")
    return instant


def _samples(
    times: list[str | float], values: list[str | float], valid: tuple[float, float]
) -> list[Sample]:
    if len(times) != len(values):
        raise ValueError("as many dates as values")
    low, high = valid
    try:
        samples = [Sample(_instant(t), _number(v)) for t, v in zip(times, values, strict=True)]
    except ValueError:
        # Not the parser's message: it would echo the sent value.
        raise ValueError("dates in ISO 8601 with time and offset, values as numbers") from None
    return [s for s in samples if low <= s.value <= high]


@dataclass(frozen=True)
class BodyBatch:
    """The weighings in a batch, as health apps keep them: weights (kg) and body fat (%) apart."""

    weights: list[Sample]
    fats: list[Sample]


# The Health app's unit for body mass, as the shortcut's "Unit" gives it.
KG_PER_UNIT = {"kg": 1.0, "lb": 0.45359237, "lbs": 0.45359237, "st": 6.35029318}


def _percent(value: float) -> float:
    """The Health app keeps body fat as a fraction (0.185); some shortcuts give 18.5."""
    return value * 100 if value <= 1 else value


class SyncBatch(BaseModel):
    """What the shortcut posts: for heart rate (``hr``) and active calories (``ae``), the samples'
    start instants (``_t``) and values (``_v``) in the same order, as lists or one per line.
    Optionally the same for body mass (``bm``, with its unit in ``bm_u``) and body fat (``bf``)."""

    hr_t: Texts
    hr_v: Texts
    ae_t: Texts
    ae_v: Texts
    bm_t: Texts
    bm_v: Texts
    bm_u: Texts  # one per sample, or just one: they are all in the Health app's unit
    bf_t: Texts
    bf_v: Texts

    @model_validator(mode="after")
    def _readable(self) -> Self:
        self.samples()
        self.body()
        return self

    def body(self) -> BodyBatch:
        unit = str(self.bm_u[0]).strip().lower() if self.bm_u else "kg"
        if unit not in KG_PER_UNIT:
            raise ValueError("the weight's unit as kg, lb or st")
        anything = (float("-inf"), float("inf"))  # the body domain drops what is out of range
        return BodyBatch(
            weights=[
                Sample(s.at, s.value * KG_PER_UNIT[unit])
                for s in _samples(self.bm_t, self.bm_v, anything)
            ],
            fats=[
                Sample(s.at, _percent(s.value)) for s in _samples(self.bf_t, self.bf_v, anything)
            ],
        )

    def samples(self) -> dict[HealthSampleType, list[Sample]]:
        return {
            HealthSampleType.HEART_RATE: _samples(self.hr_t, self.hr_v, HEART_RATE_RANGE),
            HealthSampleType.CALORIES: _samples(self.ae_t, self.ae_v, CALORIES_RANGE),
        }


class _HeartRate(BaseModel):
    # With a sample resolution in minutes the app sends a bucket instead (avg, min, max): ``bpm``
    # is then its average and ``time`` its start.
    bpm: float
    time: AwareDatetime


class _Energy(BaseModel):
    calories: float  # kcal over the interval
    start_time: AwareDatetime
    end_time: AwareDatetime


class _Mass(BaseModel):
    kilograms: float
    time: AwareDatetime


class _BodyFat(BaseModel):
    percentage: float
    time: AwareDatetime


class HealthConnectBatch(BaseModel):
    """What the HC Webhook app posts from Android (its docs/webhook.md): one list per kind of
    record, left out when there is none, among many kinds the app doesn't read. Instants are UTC
    ("2026-09-29T17:02:05Z")."""

    heart_rate: list[_HeartRate] = []
    active_calories: list[_Energy] = []
    weight: list[_Mass] = []
    body_fat: list[_BodyFat] = []

    def body(self) -> BodyBatch:
        return BodyBatch(
            weights=[Sample(record.time, record.kilograms) for record in self.weight],
            fats=[Sample(record.time, _percent(record.percentage)) for record in self.body_fat],
        )

    def samples(self) -> dict[HealthSampleType, list[Sample]]:
        low, high = HEART_RATE_RANGE
        least, most = CALORIES_RANGE
        return {
            HealthSampleType.HEART_RATE: [
                Sample(record.time, record.bpm)
                for record in self.heart_rate
                if low <= record.bpm <= high
            ],
            HealthSampleType.CALORIES: [
                piece
                for record in self.active_calories
                if least <= record.calories <= most
                for piece in spread(record.start_time, record.end_time, record.calories)
            ],
        }


Batch = SyncBatch | HealthConnectBatch
# Each source's bridge posts to the same address in its own shape.
PARSERS: dict[HealthProvider, type[SyncBatch] | type[HealthConnectBatch]] = {
    HealthProvider.APPLE_HEALTH: SyncBatch,
    HealthProvider.HEALTH_CONNECT: HealthConnectBatch,
}


class SyncResult(BaseModel):
    """What the bridge sees after a run."""

    received: int  # samples of the kinds the app keeps
    kept: int  # inside a session
    sessions: int  # sessions they belong to
    weighings: int = 0  # weighings kept (they need no session)
