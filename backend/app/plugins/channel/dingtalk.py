"""DingTalk robot channel plugin (webhook text / markdown)."""

from __future__ import annotations

from typing import Any

import httpx

from app.plugins.base import DeliveryResult, Message

_DEFAULT_TIMEOUT = 30.0
_DINGTALK_ROBOT_BASE = "https://oapi.dingtalk.com/robot/send"


class DingTalkChannelPlugin:
    """ChannelPlugin for DingTalk robots (``type="dingtalk"``).

    Config:

    - ``webhook_url``: full robot webhook URL, **or**
    - ``access_token``: used to build the standard robot webhook URL
    - ``title`` (optional): markdown title (default ``数据推送``)
    - ``msgtype`` (optional): ``markdown`` (default) or ``text``
    """

    @property
    def type(self) -> str:
        return "dingtalk"

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
    def _message_to_text(message: Message) -> str:
        parts: list[str] = []
        for part in message.parts:
            if part.kind == "text":
                parts.append(str(part.content) if part.content is not None else "")
            else:
                # Non-text parts: include a short placeholder so delivery is not empty.
                parts.append(f"[{part.kind}]")
        text = "\n\n".join(p for p in parts if p)
        return text if text else "(empty message)"

    def send(self, config: dict[str, Any], message: Message) -> DeliveryResult:
        """POST a text/markdown message to the DingTalk robot webhook."""
        try:
            self.validate_config(config)
            webhook = self._resolve_webhook(config)
        except ValueError as exc:
            return DeliveryResult(success=False, error=str(exc))

        body_text = self._message_to_text(message)
        msgtype = str(config.get("msgtype") or "markdown").lower()
        title = str(config.get("title") or "数据推送")

        if msgtype == "text":
            payload: dict[str, Any] = {
                "msgtype": "text",
                "text": {"content": body_text},
            }
        else:
            payload = {
                "msgtype": "markdown",
                "markdown": {"title": title, "text": body_text},
            }

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
