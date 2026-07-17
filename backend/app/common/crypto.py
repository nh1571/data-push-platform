"""Fernet 对称加解密助手：用于密钥类 JSON 字典（API Token、数据源配置等）。

``TOKEN_FERNET_KEY`` 必须是合法的 Fernet 密钥（url-safe base64 编码的 32 字节密钥）。

生成方式之一::

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

或::

    from app.common.crypto import generate_fernet_key
    print(generate_fernet_key())

然后在环境 / ``.env`` 中设置 ``TOKEN_FERNET_KEY=<该值>``。
密钥为空或非法时，encrypt/decrypt 会抛出带相同指引的 ``ValueError``。

本地开发亦可由 ``local_bootstrap`` 自动写入 ``data/.fernet_key``。
"""

from __future__ import annotations

import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def generate_fernet_key() -> str:
    """生成新的 Fernet 密钥字符串（可直接写入 TOKEN_FERNET_KEY）。"""
    return Fernet.generate_key().decode("ascii")


def _fernet_from_settings() -> Fernet:
    """从 settings.token_fernet_key 构造 Fernet 实例；密钥缺失/非法时抛 ValueError。"""
    key = (settings.token_fernet_key or "").strip()
    if not key:
        raise ValueError(
            "TOKEN_FERNET_KEY is empty. Generate a key with: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )
    try:
        # Fernet 接受 url-safe base64 密钥字符串的原始 bytes
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError) as exc:
        # cryptography 对畸形密钥抛 ValueError
        raise ValueError(
            "TOKEN_FERNET_KEY is invalid (must be a Fernet key). Generate one with: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        ) from exc


def encrypt_dict(d: dict[str, Any]) -> str:
    """将字典 *d* 序列化为 JSON 后 Fernet 加密，返回 token 字符串。

    使用紧凑 JSON（无多余空格），``ensure_ascii=False`` 保留中文可读原文再加密。
    """
    f = _fernet_from_settings()
    payload = json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return f.encrypt(payload).decode("ascii")


def decrypt_dict(s: str) -> dict[str, Any]:
    """解密由 :func:`encrypt_dict` 产生的 Fernet token，还原为 dict。

    - 密钥错误或密文损坏 → ``ValueError``
    - 明文不是 JSON object → ``ValueError``
    """
    f = _fernet_from_settings()
    try:
        raw = f.decrypt(s.encode("ascii"))
    except InvalidToken as exc:
        raise ValueError("failed to decrypt payload (wrong key or corrupted token)") from exc
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("decrypted payload is not a JSON object")
    return data
