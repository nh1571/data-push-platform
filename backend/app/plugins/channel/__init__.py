"""Built-in channel plugins (DingTalk stub, …)."""

from __future__ import annotations

from app.plugins.channel.dingtalk import DingTalkChannelPlugin
from app.plugins.registry import PluginRegistry

__all__ = [
    "DingTalkChannelPlugin",
    "register_builtin_channels",
]


def register_builtin_channels(registry: PluginRegistry) -> None:
    """Register built-in channel plugins on *registry*."""
    registry.register(DingTalkChannelPlugin())
