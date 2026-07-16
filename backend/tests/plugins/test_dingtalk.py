"""DingTalk channel send tests (httpx mocked)."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.plugins.base import Message, MessagePart
from app.plugins.channel.dingtalk import DingTalkChannelPlugin


def test_validate_requires_webhook_or_token() -> None:
    plugin = DingTalkChannelPlugin()
    with pytest.raises(ValueError, match="webhook_url"):
        plugin.validate_config({})


def test_send_posts_markdown_to_webhook() -> None:
    plugin = DingTalkChannelPlugin()
    message = Message(parts=[MessagePart(kind="text", content="| a |\n| --- |\n| 1 |")])

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"errcode": 0, "errmsg": "ok", "processQueryKey": "pqk-1"}

    with patch("app.plugins.channel.dingtalk.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.post.return_value = mock_resp

        result = plugin.send(
            {"webhook_url": "https://oapi.dingtalk.com/robot/send?access_token=t"},
            message,
        )

    assert result.success is True
    assert result.provider_msg_id == "pqk-1"
    args, kwargs = client.post.call_args
    assert args[0].startswith("https://oapi.dingtalk.com/")
    payload: dict[str, Any] = kwargs["json"]
    assert payload["msgtype"] == "markdown"
    assert "1" in payload["markdown"]["text"]


def test_send_handles_dingtalk_errcode() -> None:
    plugin = DingTalkChannelPlugin()
    message = Message(parts=[MessagePart(kind="text", content="hi")])

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"errcode": 310000, "errmsg": "sign not match"}

    with patch("app.plugins.channel.dingtalk.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.post.return_value = mock_resp
        result = plugin.send({"access_token": "tok"}, message)

    assert result.success is False
    assert "310000" in (result.error or "")


def test_send_pure_card_uses_action_card() -> None:
    plugin = DingTalkChannelPlugin()
    message = Message(
        parts=[
            MessagePart(
                kind="card",
                content={"title": "日报", "text": "共 **1** 行", "rows": [{"n": 1}]},
            )
        ]
    )

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"errcode": 0, "errmsg": "ok"}

    with patch("app.plugins.channel.dingtalk.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.post.return_value = mock_resp
        result = plugin.send(
            {"webhook_url": "https://oapi.dingtalk.com/robot/send?access_token=t"},
            message,
        )

    assert result.success is True
    payload: dict[str, Any] = client.post.call_args.kwargs["json"]
    assert payload["msgtype"] == "actionCard"
    assert payload["actionCard"]["title"] == "日报"
    assert "1" in payload["actionCard"]["text"]


def test_send_file_part_appends_path_text() -> None:
    plugin = DingTalkChannelPlugin()
    message = Message(
        parts=[
            MessagePart(kind="text", content="see file"),
            MessagePart(
                kind="file",
                content={"path": "/tmp/export.csv", "filename": "export.csv", "format": "csv"},
            ),
        ]
    )

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"errcode": 0}

    with patch("app.plugins.channel.dingtalk.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.post.return_value = mock_resp
        result = plugin.send({"access_token": "tok"}, message)

    assert result.success is True
    payload: dict[str, Any] = client.post.call_args.kwargs["json"]
    assert payload["msgtype"] == "markdown"
    body = payload["markdown"]["text"]
    assert "see file" in body
    assert "/tmp/export.csv" in body
    assert "export.csv" in body


def test_card_with_text_falls_back_to_markdown() -> None:
    plugin = DingTalkChannelPlugin()
    message = Message(
        parts=[
            MessagePart(kind="text", content="intro"),
            MessagePart(kind="card", content={"title": "C", "text": "body"}),
        ]
    )
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"errcode": 0}

    with patch("app.plugins.channel.dingtalk.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.post.return_value = mock_resp
        plugin.send({"access_token": "tok"}, message)

    payload: dict[str, Any] = client.post.call_args.kwargs["json"]
    assert payload["msgtype"] == "markdown"
    assert "intro" in payload["markdown"]["text"]
    assert "C" in payload["markdown"]["text"]
