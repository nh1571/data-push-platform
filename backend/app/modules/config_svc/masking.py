"""API 响应中对解密后的配置字典做敏感字段脱敏。"""

from __future__ import annotations

from typing import Any

# 出现时会被固定掩码替换的密钥键名集合。
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
    """浅拷贝 *config*，将已知密钥字段值替换为 ``******``。

    按 API 约定，password/token/secret 等键出现时脱敏，避免响应泄露凭据。
    """
    out: dict[str, Any] = {}
    for key, value in config.items():
        if key in _SECRET_KEYS and value is not None:
            out[key] = _MASK
        else:
            out[key] = value
    return out
