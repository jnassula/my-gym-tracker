"""The profile photo: stored like any upload, read back only by its owner."""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.files.models import StoredFile
from tests.conftest import MemoryStorage
from tests.helpers import signup

JPEG = b"\xff\xd8\xff\xe0" + b"photo" * 20
PNG = b"\x89PNG\r\n\x1a\n" + b"photo" * 20
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"photo" * 20


async def upload(
    client: AsyncClient,
    headers: dict[str, str],
    data: bytes = JPEG,
    filename: str = "eu.jpg",
    content_type: str = "image/jpeg",
) -> Response:
    return await client.put(
        "/api/users/me/avatar", files={"file": (filename, data, content_type)}, headers=headers
    )


async def rows(session: AsyncSession) -> int:
    return await session.scalar(select(func.count()).select_from(StoredFile)) or 0


async def test_a_new_account_has_no_photo(client: AsyncClient) -> None:
    headers = await signup(client)

    assert (await client.get("/api/users/me", headers=headers)).json()["avatar_file_id"] is None


@pytest.mark.parametrize(
    ("data", "content_type", "extension"),
    [(JPEG, "image/jpeg", "jpg"), (PNG, "image/png", "png"), (WEBP, "image/webp", "webp")],
)
async def test_the_photo_is_stored_and_read_back(
    client: AsyncClient, storage: MemoryStorage, data: bytes, content_type: str, extension: str
) -> None:
    headers = await signup(client)

    # What the client says about the file is ignored: the bytes decide.
    response = await upload(client, headers, data, "../../x.exe", "application/octet-stream")

    assert response.status_code == 200
    file_id = response.json()["avatar_file_id"]
    me = (await client.get("/api/users/me", headers=headers)).json()
    assert me["avatar_file_id"] == file_id
    [(key, (stored, stored_type))] = storage.objects.items()
    assert key == f"users/{me['id']}/avatar/{file_id}"
    assert (stored, stored_type) == (data, content_type)
    content = await client.get(f"/api/files/{file_id}/content", headers=headers)
    assert (content.status_code, content.content) == (200, data)
    assert content.headers["content-type"] == content_type
    assert f'filename="avatar.{extension}"' in content.headers["content-disposition"]


async def test_nobody_else_reads_the_photo(client: AsyncClient) -> None:
    owner = await signup(client)
    stranger = await signup(client, "bruno@example.pt")
    file_id = (await upload(client, owner)).json()["avatar_file_id"]
    path = f"/api/files/{file_id}/content"

    assert (await client.get(path)).status_code == 401
    assert (await client.get(path, headers=stranger)).json()["code"] == "file_not_found"


async def test_a_new_photo_replaces_the_old_one(
    client: AsyncClient, storage: MemoryStorage, db_session: AsyncSession
) -> None:
    headers = await signup(client)
    first = (await upload(client, headers)).json()["avatar_file_id"]

    second = (await upload(client, headers, PNG)).json()["avatar_file_id"]

    assert second != first  # a new id, so the app never shows a cached old photo
    assert [data for data, _ in storage.objects.values()] == [PNG]
    assert await rows(db_session) == 1
    assert (await client.get(f"/api/files/{first}/content", headers=headers)).status_code == 404


async def test_the_photo_can_be_removed(
    client: AsyncClient, storage: MemoryStorage, db_session: AsyncSession
) -> None:
    headers = await signup(client)
    await upload(client, headers)

    removed = await client.delete("/api/users/me/avatar", headers=headers)
    again = await client.delete("/api/users/me/avatar", headers=headers)

    assert (removed.status_code, removed.json()["avatar_file_id"]) == (200, None)
    assert (again.status_code, again.json()["avatar_file_id"]) == (200, None)
    assert storage.objects == {}
    assert await rows(db_session) == 0


async def test_deleting_the_file_itself_leaves_the_account_without_photo(
    client: AsyncClient, storage: MemoryStorage
) -> None:
    headers = await signup(client)
    file_id = (await upload(client, headers)).json()["avatar_file_id"]

    assert (await client.delete(f"/api/files/{file_id}", headers=headers)).status_code == 204

    assert (await client.get("/api/users/me", headers=headers)).json()["avatar_file_id"] is None
    assert storage.objects == {}


@pytest.mark.parametrize(
    "data",
    [b"%PDF-1.7 not a picture", b"<html><script>alert(1)</script>", b"GIF89a" + b"x" * 40, b""],
)
async def test_only_images_are_accepted(
    client: AsyncClient, storage: MemoryStorage, data: bytes
) -> None:
    headers = await signup(client)

    response = await upload(client, headers, data, "eu.jpg", "image/jpeg")

    assert (response.status_code, response.json()["code"]) == (415, "unsupported_file_type")
    assert storage.objects == {}


async def test_a_photo_over_the_limit_is_refused(
    client: AsyncClient, storage: MemoryStorage
) -> None:
    headers = await signup(client)

    response = await upload(client, headers, JPEG + b"x" * (1024 * 1024))

    assert (response.status_code, response.json()["code"]) == (413, "file_too_large")
    assert storage.objects == {}


async def test_the_photo_needs_a_session(client: AsyncClient) -> None:
    assert (await upload(client, {})).status_code == 401
    assert (await client.delete("/api/users/me/avatar")).status_code == 401


async def test_the_session_answers_carry_the_photo(client: AsyncClient) -> None:
    headers = await signup(client)
    file_id = (await upload(client, headers)).json()["avatar_file_id"]

    login = await client.post(
        "/api/auth/login", json={"email": "atleta@example.pt", "password": "Treino2026!"}
    )
    renamed = await client.patch("/api/users/me", json={"name": "Jonata"}, headers=headers)

    assert login.json()["user"]["avatar_file_id"] == file_id
    assert renamed.json()["avatar_file_id"] == file_id


async def test_deleting_the_account_deletes_its_photo(
    client: AsyncClient,
    storage: MemoryStorage,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin = await signup(client, "dona@example.pt")
    monkeypatch.setattr(get_settings(), "admin_emails", "dona@example.pt")
    headers = await signup(client)
    await upload(client, headers)
    athlete: dict[str, Any] = (await client.get("/api/users/me", headers=headers)).json()

    response = await client.delete(f"/api/admin/users/{athlete['id']}", headers=admin)

    assert response.status_code == 204
    assert storage.objects == {}
    assert await rows(db_session) == 0
    assert uuid.UUID(athlete["avatar_file_id"])  # it had one
