import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient

from app.notifications.sender import WebPushSender, generate_vapid_key, public_key_of
from tests.conftest import FakePushSender
from tests.helpers import signup

DEVICE: dict[str, Any] = {
    "endpoint": "https://push.example/v1/abc",
    "keys": {"p256dh": "BNcRdreALR", "auth": "tBHItJI5sv"},
}


async def subscribe(
    client: AsyncClient, headers: dict[str, str], device: dict[str, Any] = DEVICE
) -> None:
    response = await client.post("/api/notifications/subscriptions", json=device, headers=headers)
    assert response.status_code == 204, response.text


async def test_settings_start_from_the_designs_defaults(client: AsyncClient) -> None:
    headers = await signup(client)

    body = (await client.get("/api/notifications", headers=headers)).json()

    assert body == {
        "public_key": "BTest-application-server-key",
        "settings": {
            "training_reminder": True,
            "reminder_time": "17:30:00",
            "rest_end": True,
            "weekly_summary": False,
            "new_record": True,
            "plan_expiring": True,
        },
    }


async def test_settings_can_be_changed(client: AsyncClient) -> None:
    headers = await signup(client)

    response = await client.patch(
        "/api/notifications/settings",
        json={"weekly_summary": True, "reminder_time": "07:15"},
        headers=headers,
    )

    assert response.status_code == 200
    settings = (await client.get("/api/notifications", headers=headers)).json()["settings"]
    assert (settings["weekly_summary"], settings["reminder_time"], settings["rest_end"]) == (
        True,
        "07:15:00",
        True,
    )


@pytest.mark.parametrize("body", [{}, {"rest_end": None}, {"reminder_time": "25:00"}])
async def test_settings_are_validated(client: AsyncClient, body: dict[str, Any]) -> None:
    headers = await signup(client)

    response = await client.patch("/api/notifications/settings", json=body, headers=headers)

    assert response.status_code == 422


async def test_a_device_subscribes_and_gets_a_test_notification(
    client: AsyncClient, push_sender: FakePushSender
) -> None:
    headers = await signup(client)
    await subscribe(client, headers)
    await subscribe(client, headers)  # subscribing again changes nothing

    response = await client.post("/api/notifications/test", headers=headers)

    assert response.json() == {"sent": 1}
    [(endpoint, message)] = push_sender.sent
    assert endpoint == DEVICE["endpoint"]
    assert (message.title, message.body, message.url) == (
        "myGymTracker",
        "As notificações estão ativas neste dispositivo.",
        "/settings/notifications",
    )


async def test_notifications_speak_the_users_language(
    client: AsyncClient, push_sender: FakePushSender
) -> None:
    headers = await signup(client)
    await client.patch("/api/users/me", json={"language": "en"}, headers=headers)
    await subscribe(client, headers)

    await client.post("/api/notifications/test", headers=headers)

    assert push_sender.sent[0][1].body == "Notifications are on for this device."


async def test_a_browser_moves_to_whoever_signs_in(client: AsyncClient) -> None:
    alice = await signup(client, "alice@example.pt")
    bob = await signup(client, "bob@example.pt")
    await subscribe(client, alice)

    await subscribe(client, bob)

    assert (await client.post("/api/notifications/test", headers=alice)).json() == {"sent": 0}
    assert (await client.post("/api/notifications/test", headers=bob)).json() == {"sent": 1}


async def test_a_device_can_unsubscribe(client: AsyncClient) -> None:
    headers = await signup(client)
    await subscribe(client, headers)

    response = await client.delete(
        "/api/notifications/subscriptions", params={"endpoint": DEVICE["endpoint"]}, headers=headers
    )

    assert response.status_code == 204
    assert (await client.post("/api/notifications/test", headers=headers)).json() == {"sent": 0}


async def test_expired_devices_are_forgotten(
    client: AsyncClient, push_sender: FakePushSender
) -> None:
    headers = await signup(client)
    await subscribe(client, headers)
    push_sender.gone.add(DEVICE["endpoint"])

    assert (await client.post("/api/notifications/test", headers=headers)).json() == {"sent": 0}
    push_sender.gone.clear()
    assert (await client.post("/api/notifications/test", headers=headers)).json() == {"sent": 0}


@pytest.mark.parametrize(
    "device",
    [
        {**DEVICE, "endpoint": "http://push.example/insecure"},
        {**DEVICE, "keys": {"p256dh": "not base64!", "auth": "x"}},
        {"endpoint": DEVICE["endpoint"]},
    ],
)
async def test_subscriptions_are_validated(client: AsyncClient, device: dict[str, Any]) -> None:
    headers = await signup(client)

    response = await client.post("/api/notifications/subscriptions", json=device, headers=headers)

    assert response.status_code == 422


# --- end of rest -------------------------------------------------------------------------------


def soon(seconds: float) -> str:
    return (datetime.now(UTC) + timedelta(seconds=seconds)).isoformat()


async def test_the_end_of_rest_is_pushed_while_the_app_is_away(
    client: AsyncClient, push_sender: FakePushSender
) -> None:
    headers = await signup(client)
    await subscribe(client, headers)

    response = await client.post(
        "/api/notifications/rest", json={"ends_at": soon(0.05)}, headers=headers
    )
    await asyncio.sleep(0.2)

    assert response.status_code == 204
    [(_, message)] = push_sender.sent
    assert (message.title, message.body) == ("Fim do descanso", "Pronto — próxima série.")


async def test_coming_back_cancels_it(client: AsyncClient, push_sender: FakePushSender) -> None:
    headers = await signup(client)
    await subscribe(client, headers)

    await client.post("/api/notifications/rest", json={"ends_at": soon(0.1)}, headers=headers)
    await client.delete("/api/notifications/rest", headers=headers)
    await asyncio.sleep(0.2)

    assert push_sender.sent == []


@pytest.mark.parametrize("setup", ["rest_end off", "no device", "already over", "too long"])
async def test_no_rest_push_when_it_makes_no_sense(
    client: AsyncClient, push_sender: FakePushSender, setup: str
) -> None:
    headers = await signup(client)
    if setup != "no device":
        await subscribe(client, headers)
    if setup == "rest_end off":
        await client.patch("/api/notifications/settings", json={"rest_end": False}, headers=headers)
    delay = {"already over": -5.0, "too long": 7200.0}.get(setup, 0.05)

    await client.post("/api/notifications/rest", json={"ends_at": soon(delay)}, headers=headers)
    await asyncio.sleep(0.2)

    assert push_sender.sent == []


async def test_rest_needs_a_time_zone_aware_instant(client: AsyncClient) -> None:
    headers = await signup(client)

    response = await client.post(
        "/api/notifications/rest", json={"ends_at": "2026-09-28T18:00:00"}, headers=headers
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("method", "path"),
    [("GET", "/api/notifications"), ("POST", "/api/notifications/test"),
     ("POST", "/api/notifications/subscriptions"), ("DELETE", "/api/notifications/rest")],
)  # fmt: skip
async def test_notifications_need_a_session(client: AsyncClient, method: str, path: str) -> None:
    assert (await client.request(method, path)).status_code == 401


def test_vapid_keys_generate_a_browser_key() -> None:
    private_key = generate_vapid_key()

    public_key = public_key_of(private_key)

    assert len(public_key) == 87  # 65-byte uncompressed P-256 point, base64url without padding
    assert WebPushSender(private_key, "mailto:admin@example.pt").public_key == public_key
