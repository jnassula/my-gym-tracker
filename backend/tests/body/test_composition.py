from datetime import date

import pytest

from app.body.composition import Composition, age_on, bmi, compose
from app.users.models import Sex

# What Xiaomi_Scale_Body_Metrics.py (lolouk44/xiaomi_mi_scale, the reference these formulas were
# ported from) gives for the same readings, rounded as the app shows them.
REFERENCE = [
    ((78.45, 480, 180, 34, Sex.MALE), Composition(22.5, 53.1, 57.7, 3.1, 13, 1612)),
    ((58.3, 520, 165, 29, Sex.FEMALE), Composition(29.4, 50.4, 38.7, 2.5, 1, 1215)),
    ((95.0, 430, 175, 51, Sex.MALE), Composition(32.8, 48.0, 60.6, 3.3, 25, 1710)),
    ((49.0, 610, 162, 55, Sex.FEMALE), Composition(20.0, 54.9, 37.2, 2.0, 1, 960)),
    ((60.5, 550, 170, 22, Sex.MALE), Composition(15.7, 57.8, 48.3, 2.6, 5, 1459)),
    ((72.0, 470, 158, 44, Sex.FEMALE), Composition(42.6, 41.0, 38.8, 2.6, 9, 1264)),
]


@pytest.mark.parametrize(("reading", "expected"), REFERENCE)
def test_the_figures_match_the_reference(
    reading: tuple[float, int, int, int, Sex], expected: Composition
) -> None:
    assert compose(*reading) == expected


@pytest.mark.parametrize(
    "reading",
    [
        (78.0, 0, 180, 34, Sex.MALE),  # the scale measured no impedance (socks)
        (78.0, 3001, 180, 34, Sex.MALE),
        (9.0, 480, 180, 34, Sex.MALE),
        (201.0, 480, 180, 34, Sex.MALE),
        (78.0, 480, 221, 34, Sex.MALE),
        (78.0, 480, 180, 100, Sex.MALE),
    ],
)
def test_a_reading_out_of_the_formulas_reach_gives_nothing(
    reading: tuple[float, int, int, int, Sex],
) -> None:
    assert compose(*reading) is None


def test_age_counts_whole_years_on_the_day_of_the_weighing() -> None:
    born = date(1992, 3, 15)

    assert age_on(born, date(2026, 3, 14)) == 33
    assert age_on(born, date(2026, 3, 15)) == 34
    assert age_on(date(2000, 2, 29), date(2026, 2, 28)) == 25


def test_bmi() -> None:
    assert bmi(78.45, 180) == 24.2
