import pytest

from app.notifications.endpoints import is_push_service


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://fcm.googleapis.com/fcm/send/dQw4:APA91b",
        "https://jmt17.google.com/fcm/send/dQw4:APA91b",
        "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
        "https://web.push.apple.com/QGfx",
        "https://wns2-am3p.notify.windows.com/w/?token=BQYAAAB",
        "https://FCM.googleapis.com:443/fcm/send/abc",
    ],
)
def test_the_browsers_push_services_are_taken(endpoint: str) -> None:
    assert is_push_service(endpoint)


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://push.example/v1/abc",
        "https://storage:9000/mygymtracker",
        "https://10.0.0.5/",
        "https://[::1]/",
        "http://fcm.googleapis.com/fcm/send/abc",
        "https://fcm.googleapis.com.attacker.example/fcm/send/abc",
        "https://notfcm.googleapis.com/fcm/send/abc",
        "https://evilpush.apple.com/x",
        "https://attacker.example/?x=.push.apple.com",
        "https://fcm.googleapis.com@attacker.example/",
        "https://user:secret@fcm.googleapis.com/fcm/send/abc",
        "https://fcm.googleapis.com:8443/fcm/send/abc",
        "https://fcm.googleapis.com:port/",
        "https://[not-an-address/",
        "",
    ],
)
def test_anything_else_is_not_an_address_the_server_calls(endpoint: str) -> None:
    assert not is_push_service(endpoint)
