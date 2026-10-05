"""The reminders the scheduler sends, at fixed instants (PLAN trains on Monday and Wednesday)."""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.scheduler import run_due
from tests.conftest import FakePushSender
from tests.training import PLAN, Clock, Gym, open_gym

MONDAY_1740 = datetime(2026, 9, 28, 16, 40, tzinfo=UTC)  # 17:40 in Lisbon, after the 17:30 reminder
DEVICE = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
    "keys": {"p256dh": "BNcRdreALR", "auth": "tBHItJI5sv"},
}


async def subscribe(gym: Gym) -> None:
    response = await gym.client.post(
        "/api/notifications/subscriptions", json=DEVICE, headers=gym.headers
    )
    assert response.status_code == 204


def bodies(sender: FakePushSender) -> list[tuple[str, str]]:
    return [(message.title, message.body) for _, message in sender.sent]


async def test_the_training_reminder_goes_out_once_on_training_days(
    gym: Gym, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    await subscribe(gym)

    assert await run_due(db_session, push_sender, MONDAY_1740) == 1
    assert await run_due(db_session, push_sender, MONDAY_1740 + timedelta(minutes=5)) == 0

    assert bodies(push_sender) == [
        ("Hora de treinar", "Hoje: Quadríceps e Glúteos · 0 de 2 esta semana.")
    ]


async def test_no_reminder_before_its_time_or_long_after_it(
    gym: Gym, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    await subscribe(gym)

    before = MONDAY_1740 - timedelta(minutes=20)  # 17:20
    too_late = MONDAY_1740 + timedelta(hours=3)  # 20:40: a missed reminder isn't sent late

    assert [await run_due(db_session, push_sender, at) for at in (before, too_late)] == [0, 0]


async def test_no_reminder_on_a_day_with_nothing_due(
    gym: Gym, clock: Clock, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    await subscribe(gym)
    await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)  # Monday's

    tuesday = MONDAY_1740 + timedelta(days=1)  # the other day is Wednesday's

    assert await run_due(db_session, push_sender, tuesday) == 0


async def test_a_workout_its_weekday_left_behind_is_reminded_the_next_day(
    gym: Gym, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    await subscribe(gym)

    tuesday = MONDAY_1740 + timedelta(days=1)  # Monday's wasn't done

    assert await run_due(db_session, push_sender, tuesday) == 1
    assert bodies(push_sender)[-1][1] == "Hoje: Quadríceps e Glúteos · 0 de 2 esta semana."


async def test_the_reminder_names_what_is_left_of_the_week(
    gym: Gym, clock: Clock, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    """Wednesday's workout was done on Monday: on Wednesday it is Monday's that is due."""
    await subscribe(gym)
    await gym.client.put(f"/api/logs/days/{gym.day(1)}/done", headers=gym.headers)

    wednesday = MONDAY_1740 + timedelta(days=2)

    assert await run_due(db_session, push_sender, wednesday) == 1
    assert bodies(push_sender)[-1][1] == "Hoje: Quadríceps e Glúteos · 1 de 2 esta semana."


async def test_no_reminder_once_the_weeks_workouts_are_done(
    gym: Gym, clock: Clock, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    await subscribe(gym)
    await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    clock.advance(days=1)
    await gym.client.put(f"/api/logs/days/{gym.day(1)}/done", headers=gym.headers)  # a day early

    wednesday = MONDAY_1740 + timedelta(days=2)  # the plan's weekday, with nothing left

    assert await run_due(db_session, push_sender, wednesday) == 0


async def test_a_rotating_plan_is_reminded_until_its_week_is_done(
    client: AsyncClient, clock: Clock, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    exercise = {"name": "Prancha", "muscle_group": "abs", "sets": 3, "reps": "30 s"}
    rotating = {
        "name": "AB",
        "days": [
            {"weekday": None, "label": f"Treino {letter}", "exercises": [exercise]}
            for letter in "AB"
        ],
    }
    gym = await open_gym(client, "rotativo@example.pt", rotating)
    await subscribe(gym)

    assert await run_due(db_session, push_sender, MONDAY_1740) == 1
    assert bodies(push_sender)[-1][1] == "Hoje: Treino A · 0 de 2 esta semana."
    clock.advance(days=1)
    await gym.client.put(f"/api/logs/days/{gym.day(0)}/done", headers=gym.headers)
    assert await run_due(db_session, push_sender, MONDAY_1740 + timedelta(days=1)) == 0  # trained
    assert await run_due(db_session, push_sender, MONDAY_1740 + timedelta(days=2)) == 1
    assert bodies(push_sender)[-1][1] == "Hoje: Treino B · 1 de 2 esta semana."
    clock.advance(days=1)
    await gym.client.put(f"/api/logs/days/{gym.day(1)}/done", headers=gym.headers)
    assert await run_due(db_session, push_sender, MONDAY_1740 + timedelta(days=3)) == 0  # done


async def test_no_reminder_once_trained(
    gym: Gym, clock: Clock, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    await subscribe(gym)
    await gym.log("0/2", 45, 12)  # Monday, before the reminder

    assert await run_due(db_session, push_sender, MONDAY_1740) == 0


async def test_the_reminder_follows_the_users_time(
    gym: Gym, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    await subscribe(gym)
    await gym.client.patch(
        "/api/notifications/settings", json={"reminder_time": "07:00"}, headers=gym.headers
    )

    assert await run_due(db_session, push_sender, datetime(2026, 9, 28, 6, 5, tzinfo=UTC)) == 1


async def test_users_without_devices_get_nothing(
    gym: Gym, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    assert await run_due(db_session, push_sender, MONDAY_1740) == 0
    assert push_sender.sent == []


async def test_the_weekly_summary_on_sunday_evening(
    gym: Gym, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    await subscribe(gym)
    await gym.client.patch(
        "/api/notifications/settings",
        # The reminder is off here: Wednesday's workout is still due and would come with it.
        json={"weekly_summary": True, "training_reminder": False},
        headers=gym.headers,
    )
    await gym.log("0/1", 20, 20)  # a warm-up: not counted in the volume
    await gym.log("0/2", 45, 12)
    await gym.log("0/3", 80, 10)
    sunday_2010 = datetime(2026, 10, 4, 19, 10, tzinfo=UTC)

    assert await run_due(db_session, push_sender, sunday_2010) == 1
    assert await run_due(db_session, push_sender, sunday_2010 + timedelta(minutes=30)) == 0

    assert bodies(push_sender) == [("Resumo da semana", "Treinos: 1 · 1,3 t levantadas")]


async def test_an_expiring_plan_is_announced_once(
    gym: Gym, client: AsyncClient, db_session: AsyncSession, push_sender: FakePushSender
) -> None:
    await subscribe(gym)
    await client.post(
        "/api/workouts", json=PLAN | {"valid_until": "2026-10-05"}, headers=gym.headers
    )

    assert await run_due(db_session, push_sender, MONDAY_1740) == 2  # the reminder too
    assert (
        await run_due(db_session, push_sender, MONDAY_1740 + timedelta(days=2)) == 1
    )  # Wednesday: reminder only

    assert (
        "O teu plano está a expirar",
        "“Treino 01” devia ser trocado até 05/10. Pede o próximo PDF ao teu PT.",
    ) in bodies(push_sender)
