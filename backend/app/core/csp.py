"""Where browsers report what the Content-Security-Policy stopped (its ``report-uri``).

nginx sets the policy (``frontend/nginx/security-headers.conf``). What it blocks on someone's
phone is otherwise seen by nobody: here it becomes one line in the log. Anyone can post to this
address, so nothing in a report is trusted: three fields, cut short, without what could forge a
log line or carry a query string.
"""

import json
import logging

from fastapi import APIRouter, Request, status

from app.core.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["system"])

MAX_FIELD = 200


def _clean(value: object) -> str:
    text = value if isinstance(value, str) else ""
    address = text.split("?", 1)[0].split("#", 1)[0]
    return "".join(char for char in address if char.isprintable())[:MAX_FIELD] or "-"


@router.post("/csp-report", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
async def csp_report(request: Request) -> None:
    try:
        payload = json.loads(await request.body())
    except ValueError:
        return
    report = payload.get("csp-report") if isinstance(payload, dict) else None
    if not isinstance(report, dict):
        return
    logger.warning(
        "CSP violation: %s blocked %s on %s",
        _clean(report.get("effective-directive") or report.get("violated-directive")),
        _clean(report.get("blocked-uri")),
        _clean(report.get("document-uri")),
    )
