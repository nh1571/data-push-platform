"""钉钉自定义机器人通道插件（Webhook text / markdown / actionCard）。

注册类型：

- ``dingtalk.webhook_robot`` — 主 Webhook 机器人插件
- ``dingtalk`` — 同一实现的向后兼容别名
"""

from __future__ import annotations

from typing import Any

import httpx

from app.plugins.base import DeliveryResult, Message, MessagePart

_DEFAULT_TIMEOUT = 30.0
_DINGTALK_ROBOT_BASE = "https://oapi.dingtalk.com/robot/send"


class DingTalkWebhookRobotPlugin:
    """钉钉自定义机器人通道（``type="dingtalk.webhook_robot"``）。

    配置：

    - ``webhook_url``: 完整机器人 Webhook URL，**或**
    - ``access_token``: 用于拼装标准 robot/send URL
    - ``title``（可选）: markdown 标题（默认 ``数据推送``）
    - ``msgtype``（可选）: ``markdown``（默认）或 ``text``

    片段映射：

    - ``text`` → 正文 / markdown
    - ``card`` → 仅单卡片时用 ``actionCard``；否则 markdown 回退
    - ``file`` / ``image`` → 以路径/url 文本追加（Webhook 多数场景无法传二进制）
    """

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "dingtalk.webhook_robot"

    def validate_config(self, config: dict[str, Any]) -> None:
        """要求提供 ``webhook_url`` 或 ``access_token``（钉钉机器人鉴权）。"""
        webhook = config.get("webhook_url")
        token = config.get("access_token")
        if not webhook and not token:
            raise ValueError("webhook_url or access_token is required")

    def _resolve_webhook(self, config: dict[str, Any]) -> str:
        """解析最终 POST 的 Webhook URL。"""
        webhook = config.get("webhook_url")
        if webhook:
            return str(webhook)
        token = config.get("access_token")
        if token:
            return f"{_DINGTALK_ROBOT_BASE}?access_token={token}"
        raise ValueError("webhook_url or access_token is required")

    @staticmethod
    def _part_path(part: MessagePart) -> str | None:
        """从 part.content 提取 path / url / download_url。"""
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
        """将 card dict 转为简易 markdown 标题+正文。"""
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
        """单片段转可发送文本（含文件/图片路径说明）。"""
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
        # 未知 kind：占位，避免整条消息为空
        return f"[{part.kind}]"

    @classmethod
    def _message_to_text(cls, message: Message) -> str:
        """拼接全部片段为一段正文。"""
        parts = [cls._part_to_text(p) for p in message.parts]
        text = "\n\n".join(p for p in parts if p)
        return text if text else "(empty message)"

    @classmethod
    def _pure_single_card(cls, message: Message) -> dict[str, Any] | None:
        """当消息恰好只有一个 card 片段时返回其 content dict，否则 None。"""
        if len(message.parts) != 1:
            return None
        part = message.parts[0]
        if part.kind != "card":
            return None
        content = part.content
        return content if isinstance(content, dict) else None

    @classmethod
    def _build_payload(cls, config: dict[str, Any], message: Message) -> dict[str, Any]:
        """由 *message* 构建钉钉 Webhook JSON 体。"""
        pure_card = cls._pure_single_card(message)
        # 独立 card 片段优先使用 actionCard
        if pure_card is not None:
            title = str(pure_card.get("title") or config.get("title") or "数据推送")
            text = str(pure_card.get("text") or "")
            # 正文中带上标题，移动端展示更好
            body = f"### {title}\n\n{text}".rstrip() if text else f"### {title}"
            action: dict[str, Any] = {
                "title": title,
                "text": body,
            }
            # 卡片上可选单按钮 URL
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
        """POST text/markdown/actionCard 到钉钉机器人 Webhook。"""
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

        # 钉钉可能 HTTP 200 但 JSON 中 errcode != 0
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
            # 部分响应含 processQueryKey / messageId
            msg_id = data.get("processQueryKey") or data.get("messageId") or data.get("msgid")
            return DeliveryResult(
                success=True,
                provider_msg_id=str(msg_id) if msg_id is not None else None,
            )

        return DeliveryResult(success=True, provider_msg_id=None)


class DingTalkChannelPlugin(DingTalkWebhookRobotPlugin):
    """向后兼容别名，注册为 ``type="dingtalk"``。"""

    @property
    def type(self) -> str:
        """兼容旧配置中的 type 名。"""
        return "dingtalk"
