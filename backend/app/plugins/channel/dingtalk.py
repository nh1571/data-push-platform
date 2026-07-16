"""DingTalk channel plugin stub (validate + mock send for tests)."""

from __future__ import annotations

from typing import Any

from app.plugins.base import DeliveryResult, Message


class DingTalkChannelPlugin:
    """ChannelPlugin for DingTalk (``type="dingtalk"``).

    Real HTTP delivery is not implemented yet; :meth:`send` returns a success
    mock suitable for connection tests and local development.
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

    def send(self, config: dict[str, Any], message: Message) -> DeliveryResult:
        """Mock send — always succeeds without calling DingTalk."""
        self.validate_config(config)
        return DeliveryResult(success=True, provider_msg_id="mock-dingtalk")
