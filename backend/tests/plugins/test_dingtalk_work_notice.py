"""DingTalk work-notice channel tests (httpx mocked)."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.plugins.base import Message, MessagePart
from app.plugins.channel.dingtalk_work_notice import DingTalkWorkNoticePlugin


def _valid_config(**overrides: Any) -> dict[str, Any]:
    cfg: dict[str, Any] = {
        "app_key": "key",
        "app_secret": "secret",
        "agent_id": 12345,
        "userid_list": "u1,u2",
    }
    cfg.update(overrides)
    return cfg


def test_type() -> None:
    assert DingTalkWorkNoticePlugin().type == "dingtalk.work_notice"


def test_validate_requires_app_fields() -> None:
    plugin = DingTalkWorkNoticePlugin()
    with pytest.raises(ValueError, match="app_key"):
        plugin.validate_config({"app_secret": "s", "agent_id": 1, "userid_list": "u"})
    with pytest.raises(ValueError, match="userid_list or dept_id_list"):
        plugin.validate_config({"app_key": "k", "app_secret": "s", "agent_id": 1})


def test_validate_accepts_dept_only() -> None:
    plugin = DingTalkWorkNoticePlugin()
    plugin.validate_config(
        {"app_key": "k", "app_secret": "s", "agent_id": "99", "dept_id_list": "1,2"}
    )


def test_send_gets_token_and_posts_markdown() -> None:
    plugin = DingTalkWorkNoticePlugin()
    message = Message(parts=[MessagePart(kind="text", content="hello **world**")])

    token_resp = MagicMock()
    token_resp.status_code = 200
    token_resp.raise_for_status = MagicMock()
    token_resp.json.return_value = {"errcode": 0, "access_token": "tok-abc"}

    send_resp = MagicMock()
    send_resp.status_code = 200
    send_resp.json.return_value = {"errcode": 0, "task_id": 999}

    with patch("app.plugins.channel.dingtalk_work_notice.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.get.return_value = token_resp
        client.post.return_value = send_resp

        result = plugin.send(_valid_config(title="日报"), message)

    assert result.success is True
    assert result.provider_msg_id == "999"

    get_args, get_kwargs = client.get.call_args
    assert get_args[0] == "https://oapi.dingtalk.com/gettoken"
    assert get_kwargs["params"]["appkey"] == "key"
    assert get_kwargs["params"]["appsecret"] == "secret"

    post_args, post_kwargs = client.post.call_args
    assert post_args[0] == (
        "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2"
    )
    assert post_kwargs["params"]["access_token"] == "tok-abc"
    body = post_kwargs["json"]
    assert body["agent_id"] == 12345
    assert body["userid_list"] == "u1,u2"
    assert body["msg"]["msgtype"] == "markdown"
    assert body["msg"]["markdown"]["title"] == "日报"
    assert "hello" in body["msg"]["markdown"]["text"]


def test_send_token_error() -> None:
    plugin = DingTalkWorkNoticePlugin()
    message = Message(parts=[MessagePart(kind="text", content="x")])

    token_resp = MagicMock()
    token_resp.status_code = 200
    token_resp.raise_for_status = MagicMock()
    token_resp.json.return_value = {"errcode": 40001, "errmsg": "invalid appkey"}

    with patch("app.plugins.channel.dingtalk_work_notice.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.get.return_value = token_resp
        result = plugin.send(_valid_config(), message)

    assert result.success is False
    assert "40001" in (result.error or "")


def test_send_asyncsend_errcode() -> None:
    plugin = DingTalkWorkNoticePlugin()
    message = Message(parts=[MessagePart(kind="text", content="x")])

    token_resp = MagicMock()
    token_resp.status_code = 200
    token_resp.raise_for_status = MagicMock()
    token_resp.json.return_value = {"errcode": 0, "access_token": "tok"}

    send_resp = MagicMock()
    send_resp.status_code = 200
    send_resp.json.return_value = {"errcode": 88, "errmsg": "forbidden"}

    with patch("app.plugins.channel.dingtalk_work_notice.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.get.return_value = token_resp
        client.post.return_value = send_resp
        result = plugin.send(_valid_config(), message)

    assert result.success is False
    assert "88" in (result.error or "")
