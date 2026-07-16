"""Fernet encrypt/decrypt roundtrip tests."""

from __future__ import annotations

import pytest

from app.common.crypto import decrypt_dict, encrypt_dict, generate_fernet_key
from app.config import settings


@pytest.fixture()
def valid_fernet_key(monkeypatch: pytest.MonkeyPatch) -> str:
    """Install a valid Fernet key into settings for the duration of the test."""
    key = generate_fernet_key()
    monkeypatch.setattr(settings, "token_fernet_key", key)
    return key


def test_encrypt_decrypt_roundtrip(valid_fernet_key: str) -> None:
    payload = {"webhook": "https://example.com/hook", "secret": "s3cr3t", "n": 42}
    token = encrypt_dict(payload)
    assert isinstance(token, str)
    assert token != str(payload)

    restored = decrypt_dict(token)
    assert restored == payload


def test_generate_fernet_key_is_usable(monkeypatch: pytest.MonkeyPatch) -> None:
    key = generate_fernet_key()
    monkeypatch.setattr(settings, "token_fernet_key", key)
    assert decrypt_dict(encrypt_dict({"ok": True})) == {"ok": True}


def test_empty_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "token_fernet_key", "")
    with pytest.raises(ValueError, match="TOKEN_FERNET_KEY is empty"):
        encrypt_dict({"a": 1})


def test_invalid_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "token_fernet_key", "not-a-valid-fernet-key")
    with pytest.raises(ValueError, match="TOKEN_FERNET_KEY is invalid"):
        encrypt_dict({"a": 1})


def test_wrong_key_decrypt_fails(valid_fernet_key: str, monkeypatch: pytest.MonkeyPatch) -> None:
    token = encrypt_dict({"x": 1})
    monkeypatch.setattr(settings, "token_fernet_key", generate_fernet_key())
    with pytest.raises(ValueError, match="failed to decrypt"):
        decrypt_dict(token)


def test_settings_accepts_token_fernet_key_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Settings maps TOKEN_FERNET_KEY env var onto token_fernet_key."""
    from pydantic_settings import BaseSettings, SettingsConfigDict

    key = generate_fernet_key()
    monkeypatch.setenv("TOKEN_FERNET_KEY", key)

    class _S(BaseSettings):
        model_config = SettingsConfigDict(extra="ignore")
        token_fernet_key: str = "default"

    s = _S()
    assert s.token_fernet_key == key
