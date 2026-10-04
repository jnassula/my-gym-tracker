"""Which addresses the server will send a push to.

A subscription's endpoint comes from the browser, and the server later POSTs to it (following
redirects): left open, that is a way to make the server call any address, the ones only it can
reach included. A browser only ever hands out an endpoint of its vendor's push service, so only
those are taken.
"""

from urllib.parse import urlsplit

# Chrome and what is built on it (Edge on Android, Brave, Opera, Samsung Internet), Firefox,
# Safari, Edge on Windows. A leading dot takes any host under that name.
PUSH_SERVICES = (
    "fcm.googleapis.com",
    "jmt17.google.com",
    "updates.push.services.mozilla.com",
    ".push.apple.com",
    ".notify.windows.com",
)
HTTPS_PORT = 443


def is_push_service(url: str) -> bool:
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    return (
        parts.scheme == "https"
        and port in (None, HTTPS_PORT)
        and parts.username is None
        and parts.password is None
        and any(
            host.endswith(service) if service.startswith(".") else host == service
            for service in PUSH_SERVICES
        )
    )
