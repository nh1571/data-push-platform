"""Tests for DingTalk OpenAPI OTO robot plugin."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.plugins.base import Message, MessagePart
from app.plugins.channel.dingtalk_openapi_oto import (
    DingTalkOpenAPIOtoRobotPlugin,
    _chunked,
    _parse_user_ids,
)


def test_parse_user_ids() -> None:
    assert _parse_user_ids({"user_ids": "a,b , c"}) == ["a", "b", "c"]
    assert _parse_user_ids({"user_ids": ["x", "y"]}) == ["x", "y"]
    assert _parse_user_ids({"userid_list": "1，2"}) == ["1", "2"]


def test_chunked() -> None:
    assert _chunked(["1", "2", "3", "4", "5"], 2) == [["1", "2"], ["3", "4"], ["5"]]


def test_validate_config() -> None:
    p = DingTalkOpenAPIOtoRobotPlugin()
    with pytest.raises(ValueError, match="missing"):
        p.validate_config({})
    with pytest.raises(ValueError, match="user_ids"):
        p.validate_config(
            {"app_key": "k", "app_secret": "s", "robot_code": "r", "user_ids": ""}
        )
    p.validate_config(
        {
            "app_key": "k",
            "app_secret": "s",
            "robot_code": "r",
            "user_ids": "u1,u2",
        }
    )


def test_send_markdown_batches(monkeypatch: pytest.MonkeyPatch) -> None:
    p = DingTalkOpenAPIOtoRobotPlugin()
    config = {
        "app_key": "k",
        "app_secret": "s",
        "robot_code": "r",
        "user_ids": "u1,u2,u3",
        "batch_size": 2,
        "title": "T",
    }
    message = Message(parts=[MessagePart(kind="text", content="hello")])

    calls: list[dict] = []

    def fake_send_oto(self, client, access_token, cfg, user_ids, msg_key, msg_param):
        calls.append({"user_ids": list(user_ids), "msg_key": msg_key, "msg_param": msg_param})
        return {"processQueryKey": f"pk-{len(calls)}"}

    monkeypatch.setattr(
        DingTalkOpenAPIOtoRobotPlugin,
        "_fetch_new_access_token",
        lambda self, client, cfg: "tok",
    )
    monkeypatch.setattr(DingTalkOpenAPIOtoRobotPlugin, "_send_oto", fake_send_oto)

    with patch("app.plugins.channel.dingtalk_openapi_oto.httpx.Client") as client_cls:
        client_cls.return_value.__enter__.return_value = MagicMock()
        result = p.send(config, message)

    assert result.success is True
    assert len(calls) == 2
    assert calls[0]["user_ids"] == ["u1", "u2"]
    assert calls[1]["user_ids"] == ["u3"]
    assert calls[0]["msg_key"] == "sampleMarkdown"
