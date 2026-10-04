import json
import logging

import pytest
from httpx import AsyncClient

REPORT = {
    "csp-report": {
        "document-uri": "https://gym.example.com/progress?token=secret#chart",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://attacker.example/x.js?session=abc",
        "original-policy": "default-src 'self'",
    }
}
CSP_REPORT = {"Content-Type": "application/csp-report"}


async def test_a_violation_becomes_one_line_in_the_log(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="app.core.csp"):
        response = await client.post(
            "/api/csp-report", content=json.dumps(REPORT), headers=CSP_REPORT
        )

    assert response.status_code == 204
    assert caplog.messages == [
        "CSP violation: script-src-elem blocked https://attacker.example/x.js"
        " on https://gym.example.com/progress"
    ]


async def test_a_report_cannot_write_its_own_log_lines(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    forged = {
        "csp-report": {
            "effective-directive": "img-src\nINFO forged line",
            "blocked-uri": "x" * 5000,
            "document-uri": {"not": "a string"},
        }
    }

    with caplog.at_level(logging.WARNING, logger="app.core.csp"):
        await client.post("/api/csp-report", content=json.dumps(forged), headers=CSP_REPORT)

    [line] = caplog.messages
    assert "\n" not in line
    assert len(line) < 500
    assert line.endswith(" on -")


@pytest.mark.parametrize("body", [b"", b"not json", b"[]", b'{"csp-report": "text"}', b"{}"])
async def test_anything_else_is_ignored(
    client: AsyncClient, caplog: pytest.LogCaptureFixture, body: bytes
) -> None:
    with caplog.at_level(logging.WARNING, logger="app.core.csp"):
        response = await client.post("/api/csp-report", content=body, headers=CSP_REPORT)

    assert response.status_code == 204
    assert caplog.messages == []


async def test_reports_are_small_and_few(client: AsyncClient) -> None:
    big = await client.post("/api/csp-report", content=b"x" * 20_000, headers=CSP_REPORT)
    assert big.status_code == 413

    for _ in range(20):
        await client.post("/api/csp-report", content=b"{}", headers=CSP_REPORT)
    assert (await client.post("/api/csp-report", content=b"{}")).status_code == 429
