"""Prints a new VAPID key for .env: ``python -m app.notifications.keys``.

Keep it secret and stable: changing it invalidates every device's subscription.
"""

from app.notifications.sender import generate_vapid_key, public_key_of

if __name__ == "__main__":
    private_key = generate_vapid_key()
    print(f"VAPID_PRIVATE_KEY={private_key}")
    print(f"# public key (derived, not needed in .env): {public_key_of(private_key)}")
