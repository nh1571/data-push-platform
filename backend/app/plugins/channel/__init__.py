"""Built-in channel plugins (DingTalk webhook / work notice / OpenAPI group & OTO)."""

from __future__ import annotations

from app.plugins.channel.dingtalk import DingTalkChannelPlugin, DingTalkWebhookRobotPlugin
from app.plugins.channel.dingtalk_openapi_group import DingTalkOpenAPIGroupRobotPlugin
from app.plugins.channel.dingtalk_openapi_oto import DingTalkOpenAPIOtoRobotPlugin
from app.plugins.channel.dingtalk_work_notice import DingTalkWorkNoticePlugin
from app.plugins.registry import PluginRegistry

__all__ = [
    "DingTalkChannelPlugin",
    "DingTalkWebhookRobotPlugin",
    "DingTalkWorkNoticePlugin",
    "DingTalkOpenAPIGroupRobotPlugin",
    "DingTalkOpenAPIOtoRobotPlugin",
    "register_builtin_channels",
]


def register_builtin_channels(registry: PluginRegistry) -> None:
    """Register built-in channel plugins on *registry*."""
    # Primary type + backward-compatible alias share the same webhook impl.
    registry.register(DingTalkWebhookRobotPlugin())
    registry.register(DingTalkChannelPlugin())
    registry.register(DingTalkWorkNoticePlugin())
    registry.register(DingTalkOpenAPIGroupRobotPlugin())
    registry.register(DingTalkOpenAPIOtoRobotPlugin())
