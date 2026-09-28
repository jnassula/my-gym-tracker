"""Shared by the training-log and progress tests: a sample plan, a movable clock, a user."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from httpx import AsyncClient

from tests.helpers import signup

MONDAY = datetime(2026, 9, 28, 17, 30, tzinfo=UTC)  # 18:30 in Lisbon

PLAN: dict[str, Any] = {
    "name": "Treino 01",
    "days": [
        {"weekday": 0, "label": "Quadríceps e Glúteos", "exercises": [
            {"name": "Esteira", "muscle_group": "warmup", "reps": "30 min"},
            {"name": "Cadeira Extensora", "muscle_group": "warmup", "sets": 2, "reps": "20"},
            {"name": "Cadeira Extensora", "muscle_group": "quads", "sets": 3, "reps": "12"},
            {"name": "Agachamento Livre", "muscle_group": "quads", "sets": 2, "reps": "8-12"},
        ]},
        {"weekday": 2, "label": "Costas", "exercises": [
            {"name": "Remada Curvada", "muscle_group": "back", "sets": 3, "reps": "12"},
        ]},
    ],
}  # fmt: skip


@dataclass
class Clock:
    now: datetime

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


@dataclass
class Gym:
    """A signed-in user with PLAN imported; exercises by "day/index", e.g. ``ex["0/2"]``."""

    client: AsyncClient
    headers: dict[str, str]
    plan: dict[str, Any]
    ex: dict[str, str]

    def day(self, index: int) -> str:
        return str(self.plan["days"][index]["id"])

    async def log(self, exercise: str, weight: float, reps: int) -> dict[str, Any]:
        response = await self.client.post(
            f"/api/logs/exercises/{self.ex[exercise]}/sets",
            json={"weight": weight, "reps": reps},
            headers=self.headers,
        )
        assert response.status_code == 201, response.text
        result: dict[str, Any] = response.json()
        return result

    async def get(self, path: str) -> Any:
        response = await self.client.get(path, headers=self.headers)
        assert response.status_code == 200, response.text
        return response.json()


async def open_gym(client: AsyncClient, email: str = "atleta@example.pt", plan: Any = None) -> Gym:
    headers = await signup(client, email)
    response = await client.post("/api/workouts", json=plan or PLAN, headers=headers)
    assert response.status_code == 201, response.text
    created = response.json()
    exercises = {
        f"{d}/{e}": exercise["id"]
        for d, day in enumerate(created["days"])
        for e, exercise in enumerate(day["exercises"])
    }
    return Gym(client, headers, created, exercises)
