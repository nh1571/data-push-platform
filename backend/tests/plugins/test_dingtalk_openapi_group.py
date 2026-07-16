"""DingTalk OpenAPI group robot channel tests (httpx mocked)."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.plugins.base import Message, MessagePart
from app.plugins.channel.dingtalk_openapi_group import DingTalkOpenAPIGroupRobotPlugin


def _valid_config(**overrides: Any) -> dict[str, Any]:
    cfg: dict[str, Any] = {
        "app_key": "key",
        "app_secret": "secret",
        "robot_code": "dingbot",
        "open_conversation_id": "cid123",
    }
    cfg.update(overrides)
    return cfg


def test_type() -> None:
    assert DingTalkOpenAPIGroupRobotPlugin().type == "dingtalk.openapi_group_robot"


def test_validate_requires_fields() -> None:
    plugin = DingTalkOpenAPIGroupRobotPlugin()
    with pytest.raises(ValueError, match="app_key"):
        plugin.validate_config(
            {"app_secret": "s", "robot_code": "r", "open_conversation_id": "c"}
        )
    with pytest.raises(ValueError, match="robot_code"):
        plugin.validate_config(
            {"app_key": "k", "app_secret": "s", "open_conversation_id": "c"}
        )
    plugin.validate_config(_valid_config())


def test_send_markdown_via_group_api() -> None:
    plugin = DingTalkOpenAPIGroupRobotPlugin()
    message = Message(parts=[MessagePart(kind="text", content="hello **group**")])

    token_resp = MagicMock()
    token_resp.status_code = 200
    token_resp.raise_for_status = MagicMock()
    token_resp.json.return_value = {"accessToken": "new-tok"}

    send_resp = MagicMock()
    send_resp.status_code = 200
    send_resp.json.return_value = {"processQueryKey": "pqk-1"}

    with patch("app.plugins.channel.dingtalk_openapi_group.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.post.side_effect = [token_resp, send_resp]

        result = plugin.send(_valid_config(title="日报"), message)

    assert result.success is True
    assert result.provider_msg_id == "pqk-1"

    # first post: oauth, second: group message
    assert client.post.call_count == 2
    oauth_args, oauth_kwargs = client.post.call_args_list[0]
    assert oauth_args[0] == "https://api.dingtalk.com/v1.0/oauth2/accessToken"
    assert oauth_kwargs["json"]["appKey"] == "key"

    msg_args, msg_kwargs = client.post.call_args_list[1]
    assert msg_args[0] == "https://api.dingtalk.com/v1.0/robot/groupMessages/send"
    assert msg_kwargs["headers"]["x-acs-dingtalk-access-token"] == "new-tok"
    body = msg_kwargs["json"]
    assert body["robotCode"] == "dingbot"
    assert body["openConversationId"] == "cid123"
    assert body["msgKey"] == "sampleMarkdown"
    assert "hello" in body["msgParam"]


def test_send_image_uploads_media(tmp_path: Path) -> None:
    plugin = DingTalkOpenAPIGroupRobotPlugin()
    img = tmp_path / "t.png"
    img.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)

    message = Message(
        parts=[
            MessagePart(kind="text", content="caption"),
            MessagePart(kind="image", content={"path": str(img), "title": "t"}),
        ]
    )

    oauth_resp = MagicMock()
    oauth_resp.status_code = 200
    oauth_resp.raise_for_status = MagicMock()
    oauth_resp.json.return_value = {"accessToken": "new-tok"}

    md_resp = MagicMock()
    md_resp.status_code = 200
    md_resp.json.return_value = {"processQueryKey": "md-1"}

    oapi_token_resp = MagicMock()
    oapi_token_resp.status_code = 200
    oapi_token_resp.raise_for_status = MagicMock()
    oapi_token_resp.json.return_value = {"errcode": 0, "access_token": "oapi-tok"}

    upload_resp = MagicMock()
    upload_resp.status_code = 200
    upload_resp.raise_for_status = MagicMock()
    upload_resp.json.return_value = {"errcode": 0, "media_id": "media-xyz"}

    img_resp = MagicMock()
    img_resp.status_code = 200
    img_resp.json.return_value = {"processQueryKey": "img-1"}

    with patch("app.plugins.channel.dingtalk_openapi_group.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        # post: oauth, markdown, upload, image msg
        client.post.side_effect = [oauth_resp, md_resp, upload_resp, img_resp]
        client.get.return_value = oapi_token_resp

        result = plugin.send(_valid_config(), message)

    assert result.success is True
    assert result.provider_msg_id is not None
    assert "md-1" in (result.provider_msg_id or "")
    assert "img-1" in (result.provider_msg_id or "")

    # media upload called with oapi token
    upload_calls = [
        c for c in client.post.call_args_list if "media/upload" in str(c.args[0])
    ]
    assert upload_calls
    assert upload_calls[0].kwargs["params"]["access_token"] == "oapi-tok"


def test_send_invalid_config() -> None:
    plugin = DingTalkOpenAPIGroupRobotPlugin()
    result = plugin.send({}, Message(parts=[MessagePart(kind="text", content="x")]))
    assert result.success is False
    assert "missing" in (result.error or "")
