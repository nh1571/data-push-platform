"""Mask secret fields in decrypted config dicts for API responses."""

from __future__ import annotations

from typing import Any

# Keys whose values are replaced with a fixed mask when present.
_SECRET_KEYS: frozenset[str] = frozenset(
    {
        "password",
        "secret",
        "token",
        "access_token",
        "app_secret",
        "client_secret",
    }
)

_MASK = "******"


def mask_config(config: dict[str, Any]) -> dict[str, Any]:
    """Return a shallow copy of *config* with known secret values masked.

    Per API contract, ``password`` (and other common secret keys) become
    ``******`` when present so responses never leak credentials.
    """
    out: dict[str, Any] = {}
    for key, value in config.items():
        if key in _SECRET_KEYS and value is not None:
            out[key] = _MASK
        else:
            out[key] = value
    return out
