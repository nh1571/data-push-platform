"""DingTalk robot channel plugins (webhook text / markdown / actionCard).

Registered types:

- ``dingtalk.webhook_robot`` — primary webhook robot plugin
- ``dingtalk`` — backward-compatible alias of the same implementation
"""

from __future__ import annotations

from typing import Any

import httpx

from app.plugins.base import DeliveryResult, Message, MessagePart

_DEFAULT_TIMEOUT = 30.0
_DINGTALK_ROBOT_BASE = "https://oapi.dingtalk.com/robot/send"


class DingTalkWebhookRobotPlugin:
    """ChannelPlugin for DingTalk custom robots (``type="dingtalk.webhook_robot"``).

    Config:

    - ``webhook_url``: full robot webhook URL, **or**
    - ``access_token``: used to build the standard robot webhook URL
    - ``title`` (optional): markdown title (default ``数据推送``)
    - ``msgtype`` (optional): ``markdown`` (default) or ``text``

    Part mapping:

    - ``text`` → body text / markdown
    - ``card`` → single pure card → ``actionCard``; otherwise markdown fallback
    - ``file`` / ``image`` → path/url appended as text (webhooks cannot upload
      binary attachments in most robot setups)
    """

    @property
    def type(self) -> str:
        return "dingtalk.webhook_robot"

    def validate_config(self, config: dict[str, Any]) -> None:
        """Require ``webhook_url`` or ``access_token`` (DingTalk robot auth)."""
        webhook = config.get("webhook_url")
        token = config.get("access_token")
        if not webhook and not token:
            raise ValueError("webhook_url or access_token is required")

    def _resolve_webhook(self, config: dict[str, Any]) -> str:
        webhook = config.get("webhook_url")
        if webhook:
            return str(webhook)
        token = config.get("access_token")
        if token:
            return f"{_DINGTALK_ROBOT_BASE}?access_token={token}"
        raise ValueError("webhook_url or access_token is required")

    @staticmethod
    def _part_path(part: MessagePart) -> str | None:
        content = part.content
        if isinstance(content, dict):
            for key in ("path", "url", "download_url"):
                if content.get(key):
                    return str(content[key])
            return None
        if content is None:
            return None
        return str(content)

    @classmethod
    def _card_to_markdown(cls, content: Any) -> str:
        if not isinstance(content, dict):
            return str(content) if content is not None else ""
        title = content.get("title") or "卡片"
        text = content.get("text") or ""
        lines = [f"### {title}", ""]
        if text:
            lines.append(str(text))
        return "\n".join(lines).rstrip()

    @classmethod
    def _part_to_text(cls, part: MessagePart) -> str:
        if part.kind == "text":
            return str(part.content) if part.content is not None else ""
        if part.kind == "card":
            return cls._card_to_markdown(part.content)
        if part.kind == "file":
            path = cls._part_path(part)
            name = ""
            if isinstance(part.content, dict) and part.content.get("filename"):
                name = str(part.content["filename"])
            label = f"文件: {name}".rstrip() if name else "文件"
            return f"{label}\n下载路径: {path}" if path else f"{label}: (no path)"
        if part.kind == "image":
            path = cls._part_path(part)
            return f"图片路径: {path}" if path else "图片: (no path)"
        # Unknown kinds: short placeholder so delivery is not empty.
        return f"[{part.kind}]"

    @classmethod
    def _message_to_text(cls, message: Message) -> str:
        parts = [cls._part_to_text(p) for p in message.parts]
        text = "\n\n".join(p for p in parts if p)
        return text if text else "(empty message)"

    @classmethod
    def _pure_single_card(cls, message: Message) -> dict[str, Any] | None:
        """Return card content when message is exactly one card part (no others)."""
        if len(message.parts) != 1:
            return None
        part = message.parts[0]
        if part.kind != "card":
            return None
        content = part.content
        return content if isinstance(content, dict) else None

    @classmethod
    def _build_payload(cls, config: dict[str, Any], message: Message) -> dict[str, Any]:
        """Build DingTalk webhook JSON body from *message*."""
        pure_card = cls._pure_single_card(message)
        # Prefer actionCard for a standalone card part.
        if pure_card is not None:
            title = str(pure_card.get("title") or config.get("title") or "数据推送")
            text = str(pure_card.get("text") or "")
            # Include title in markdown body for better mobile display.
            body = f"### {title}\n\n{text}".rstrip() if text else f"### {title}"
            action: dict[str, Any] = {
                "title": title,
                "text": body,
            }
            # Optional single button if URL provided on card content.
            btn_url = pure_card.get("url") or pure_card.get("single_url")
            btn_title = pure_card.get("btn_title") or pure_card.get("single_title")
            if btn_url:
                action["singleTitle"] = str(btn_title or "查看详情")
                action["singleURL"] = str(btn_url)
            return {"msgtype": "actionCard", "actionCard": action}

        body_text = cls._message_to_text(message)
        msgtype = str(config.get("msgtype") or "markdown").lower()
        title = str(config.get("title") or "数据推送")

        if msgtype == "text":
            return {
                "msgtype": "text",
                "text": {"content": body_text},
            }
        return {
            "msgtype": "markdown",
            "markdown": {"title": title, "text": body_text},
        }

    def send(self, config: dict[str, Any], message: Message) -> DeliveryResult:
        """POST text/markdown/actionCard to the DingTalk robot webhook."""
        try:
            self.validate_config(config)
            webhook = self._resolve_webhook(config)
        except ValueError as exc:
            return DeliveryResult(success=False, error=str(exc))

        payload = self._build_payload(config, message)

        try:
            with httpx.Client(timeout=_DEFAULT_TIMEOUT) as client:
                resp = client.post(webhook, json=payload)
        except httpx.HTTPError as exc:
            return DeliveryResult(success=False, error=f"http error: {exc}")

        # DingTalk may return HTTP 200 with errcode != 0 in JSON body.
        try:
            data = resp.json()
        except ValueError:
            data = None

        if resp.status_code >= 400:
            detail = data if data is not None else resp.text[:500]
            return DeliveryResult(
                success=False,
                error=f"HTTP {resp.status_code}: {detail}",
            )

        if isinstance(data, dict):
            errcode = data.get("errcode", 0)
            if errcode not in (0, "0", None):
                errmsg = data.get("errmsg") or str(data)
                return DeliveryResult(success=False, error=f"dingtalk errcode={errcode}: {errmsg}")
            # Some responses include a processQueryKey / messageId
            msg_id = data.get("processQueryKey") or data.get("messageId") or data.get("msgid")
            return DeliveryResult(
                success=True,
                provider_msg_id=str(msg_id) if msg_id is not None else None,
            )

        return DeliveryResult(success=True, provider_msg_id=None)


class DingTalkChannelPlugin(DingTalkWebhookRobotPlugin):
    """Backward-compatible alias registered as ``type="dingtalk"``."""

    @property
    def type(self) -> str:
        return "dingtalk"
