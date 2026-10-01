"""Body composition from a scale's reading (pure).

A scale like the Xiaomi Mi Body Composition Scale measures two things: weight and the body's
impedance. Everything else its app shows is arithmetic over those two and the person's height,
age and sex. The formulas here are the ones reverse-engineered from the Mi Fit app, ported from
``Xiaomi_Scale_Body_Metrics.py`` in https://github.com/lolouk44/xiaomi_mi_scale:

    MIT License, Copyright (c) 2020 lolouk44

    Permission is hereby granted, free of charge, to any person obtaining a copy of this software
    and associated documentation files (the "Software"), to deal in the Software without
    restriction, including without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all copies or
    substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
    BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
    DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

They are estimates, as on the scale's own app: good for following a trend, not a medical figure.
"""

from dataclasses import dataclass
from datetime import date

from app.users.models import Sex

# Outside these the formulas say nothing sensible (the reference refuses them too).
MAX_HEIGHT_CM = 220
WEIGHT_KG = (10, 200)
MAX_AGE = 99
MAX_IMPEDANCE = 3000


@dataclass(frozen=True)
class Composition:
    body_fat_pct: float
    water_pct: float
    muscle_kg: float
    bone_kg: float
    visceral_fat: int  # a rating from 1 to 50, as the scale's app shows it
    bmr_kcal: int  # basal metabolic rate, per day


def age_on(birth_date: date, day: date) -> int:
    """Whole years on that day."""
    return day.year - birth_date.year - ((day.month, day.day) < (birth_date.month, birth_date.day))


def bmi(weight: float, height_cm: int) -> float:
    return round(weight / (height_cm / 100) ** 2, 1)


def _within(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def _lean_mass(weight: float, impedance: int, height: int, age: int) -> float:
    lean = (height * 9.058 / 100) * (height / 100)
    lean += weight * 0.32 + 12.226
    lean -= impedance * 0.0068
    lean -= age * 0.0542
    return lean


def _fat_pct(weight: float, lean: float, height: int, age: int, sex: Sex) -> float:
    constant = (9.25 if age <= 49 else 7.25) if sex is Sex.FEMALE else 0.8
    coefficient = 1.0
    if sex is Sex.MALE and weight < 61:
        coefficient = 0.98
    elif sex is Sex.FEMALE and weight > 60:
        coefficient = 0.96 * (1.03 if height > 160 else 1.0)
    elif sex is Sex.FEMALE and weight < 50:
        coefficient = 1.02 * (1.03 if height > 160 else 1.0)
    fat = (1.0 - (((lean - constant) * coefficient) / weight)) * 100
    if fat > 63:
        fat = 75
    return _within(fat, 5, 75)


def _water_pct(fat: float) -> float:
    water = (100 - fat) * 0.7
    coefficient = 1.02 if water <= 50 else 0.98
    if water * coefficient >= 65:
        water = 75
    return _within(water * coefficient, 35, 75)


def _bone_kg(lean: float, sex: Sex) -> float:
    base = 0.245691014 if sex is Sex.FEMALE else 0.18016894
    bone = (base - (lean * 0.05158)) * -1
    bone += 0.1 if bone > 2.2 else -0.1
    if bone > (5.1 if sex is Sex.FEMALE else 5.2):
        bone = 8
    return _within(bone, 0.5, 8)


def _muscle_kg(weight: float, fat: float, bone: float, sex: Sex) -> float:
    muscle = weight - ((fat * 0.01) * weight) - bone
    if muscle >= (84 if sex is Sex.FEMALE else 93.5):
        muscle = 120
    return _within(muscle, 10, 120)


def _visceral_fat(weight: float, height: int, age: int, sex: Sex) -> float:
    if sex is Sex.FEMALE:
        if weight > (13 - (height * 0.5)) * -1:
            divisor = ((height * 1.45) + (height * 0.1158) * height) - 120
            rating = (weight * 500 / divisor - 6) + (age * 0.07)
        else:
            factor = 0.691 + (height * -0.0024) + (height * -0.0024)
            rating = (((height * 0.027) - (factor * weight)) * -1) + (age * 0.07) - age
    elif height < weight * 1.6:
        divisor = ((height * 0.4) - (height * (height * 0.0826))) * -1
        rating = ((weight * 305) / (divisor + 48)) - 2.9 + (age * 0.15)
    else:
        factor = 0.765 + height * -0.0015
        rating = (((height * 0.143) - (weight * factor)) * -1) + (age * 0.15) - 5.0
    return _within(rating, 1, 50)


def _bmr_kcal(weight: float, height: int, age: int, sex: Sex) -> float:
    if sex is Sex.FEMALE:
        bmr = 864.6 + weight * 10.2036 - height * 0.39336 - age * 6.204
    else:
        bmr = 877.8 + weight * 14.916 - height * 0.726 - age * 8.976
    if bmr > (2996 if sex is Sex.FEMALE else 2322):
        bmr = 5000
    return _within(bmr, 500, 10000)


def compose(
    weight: float, impedance: int, height_cm: int, age: int, sex: Sex
) -> Composition | None:
    """What the scale's app would show for this reading, or nothing when it is out of the
    formulas' reach (no impedance was measured, a child's height…)."""
    if not (
        0 < impedance <= MAX_IMPEDANCE
        and WEIGHT_KG[0] <= weight <= WEIGHT_KG[1]
        and height_cm <= MAX_HEIGHT_CM
        and 0 <= age <= MAX_AGE
    ):
        return None
    lean = _lean_mass(weight, impedance, height_cm, age)
    fat = _fat_pct(weight, lean, height_cm, age, sex)
    bone = _bone_kg(lean, sex)
    return Composition(
        body_fat_pct=round(fat, 1),
        water_pct=round(_water_pct(fat), 1),
        muscle_kg=round(_muscle_kg(weight, fat, bone, sex), 1),
        bone_kg=round(bone, 1),
        visceral_fat=round(_visceral_fat(weight, height_cm, age, sex)),
        bmr_kcal=round(_bmr_kcal(weight, height_cm, age, sex)),
    )
