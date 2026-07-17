"""内置通道插件：钉钉 Webhook / 工作通知 / OpenAPI 群与单聊机器人。"""

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
    """将内置通道插件注册到 *registry*。"""
    # 主 type + 向后兼容别名共享同一 webhook 实现
    registry.register(DingTalkWebhookRobotPlugin())
    registry.register(DingTalkChannelPlugin())
    registry.register(DingTalkWorkNoticePlugin())
    registry.register(DingTalkOpenAPIGroupRobotPlugin())
    registry.register(DingTalkOpenAPIOtoRobotPlugin())
