"""Built-in renderer plugins (text_md, …)."""

from __future__ import annotations

from app.plugins.registry import PluginRegistry
from app.plugins.renderer.text_md import TextMarkdownRenderer

__all__ = [
    "TextMarkdownRenderer",
    "register_builtin_renderers",
]


def register_builtin_renderers(registry: PluginRegistry) -> None:
    """Register built-in renderer plugins on *registry*."""
    registry.register(TextMarkdownRenderer())
