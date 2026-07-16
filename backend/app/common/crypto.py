"""Fernet encrypt/decrypt helpers for secret JSON dicts (tokens, DS configs, …).

TOKEN_FERNET_KEY must be a valid Fernet key (url-safe base64-encoded 32-byte key).

Generate one with either:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

or:

    from app.common.crypto import generate_fernet_key
    print(generate_fernet_key())

Then set ``TOKEN_FERNET_KEY=<that value>`` in the environment / ``.env``.
If the key is empty or invalid, encrypt/decrypt raise ValueError with the same guidance.
"""

from __future__ import annotations

import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def generate_fernet_key() -> str:
    """Return a new Fernet key as a UTF-8 string (suitable for TOKEN_FERNET_KEY)."""
    return Fernet.generate_key().decode("ascii")


def _fernet_from_settings() -> Fernet:
    key = (settings.token_fernet_key or "").strip()
    if not key:
        raise ValueError(
            "TOKEN_FERNET_KEY is empty. Generate a key with: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )
    try:
        # Fernet accepts raw bytes of the url-safe base64 key string.
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError) as exc:
        # cryptography raises ValueError for malformed keys
        raise ValueError(
            "TOKEN_FERNET_KEY is invalid (must be a Fernet key). Generate one with: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        ) from exc


def encrypt_dict(d: dict[str, Any]) -> str:
    """Serialize *d* as JSON and return a Fernet token string."""
    f = _fernet_from_settings()
    payload = json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return f.encrypt(payload).decode("ascii")


def decrypt_dict(s: str) -> dict[str, Any]:
    """Decrypt a Fernet token produced by :func:`encrypt_dict` back to a dict."""
    f = _fernet_from_settings()
    try:
        raw = f.decrypt(s.encode("ascii"))
    except InvalidToken as exc:
        raise ValueError("failed to decrypt payload (wrong key or corrupted token)") from exc
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("decrypted payload is not a JSON object")
    return data
