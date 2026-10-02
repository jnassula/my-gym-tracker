"""The exercise library: the user's exercises with their last weight, then the base list."""

from typing import Any

from httpx import AsyncClient

from app.exercises.library import _BASE, base_entries
from app.users.models import Language
from tests.helpers import signup
from tests.training import Gym


def by_name(library: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {f"{e['name']}|{e['muscle_group']}": e for e in library["entries"]}


async def test_the_users_exercises_come_first_with_their_last_weight(gym: Gym) -> None:
    await gym.log("1/0", 50, 12)
    await gym.log("1/0", 52.5, 10)

    library = await gym.get("/api/exercises/library")

    entries = by_name(library)
    remada = entries["Remada Curvada|back"]
    assert remada == {
        "name": "Remada Curvada",
        "muscle_group": "back",
        "source": "plan",
        "plan_name": "Treino 01",
        "last_weight": "52.50",
    }
    # Never logged: no weight. The warm-up and working "Cadeira Extensora" are two entries.
    assert entries["Cadeira Extensora|warmup"]["last_weight"] is None
    assert entries["Cadeira Extensora|quads"]["source"] == "plan"
    # The user's entries lead, then the base list, which skips what the user already has.
    sources = [e["source"] for e in library["entries"]]
    assert sources[:5] == ["plan"] * 5
    # Esteira, Cadeira Extensora (quads) and Agachamento Livre are theirs already.
    assert sources[5:] == ["base"] * (len(_BASE) - 3)
    assert entries["Supino Reto com Barra|chest"]["source"] == "base"


async def test_the_base_list_speaks_the_users_language(client: AsyncClient) -> None:
    headers = await signup(client, "en@example.pt")
    await client.patch("/api/users/me", json={"language": "en"}, headers=headers)

    library = (await client.get("/api/exercises/library", headers=headers)).json()

    names = {e["name"] for e in library["entries"]}
    assert "Barbell bench press" in names
    assert "Supino Reto com Barra" not in names
    assert len(library["entries"]) == len(_BASE)


def test_the_base_list_has_no_duplicates_in_any_language() -> None:
    for language in Language:
        entries = base_entries(language)
        keys = {(name.lower(), group) for name, group in entries}
        assert len(keys) == len(entries), language
        assert all(name.strip() == name and name for name, _ in entries)


async def test_a_deleted_plans_weights_still_count(gym: Gym) -> None:
    await gym.log("1/0", 50, 12)
    await gym.client.delete(f"/api/workouts/{gym.plan['id']}", headers=gym.headers)
    remada = {"name": "remada curvada", "muscle_group": "back", "sets": 3, "reps": "10"}
    plan = {"name": "Treino 02", "days": [{"weekday": 0, "label": "", "exercises": [remada]}]}
    response = await gym.client.post("/api/workouts", json=plan, headers=gym.headers)
    assert response.status_code == 201, response.text

    library = await gym.get("/api/exercises/library")

    entries = by_name(library)
    assert entries["remada curvada|back"]["plan_name"] == "Treino 02"
    assert entries["remada curvada|back"]["last_weight"] == "50.00"
    assert "Esteira|warmup" not in entries or entries["Esteira|warmup"]["source"] == "base"
