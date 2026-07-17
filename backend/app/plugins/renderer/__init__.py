"""内置渲染器插件：text_md、image_table、card、file_export。"""

from __future__ import annotations

from app.plugins.registry import PluginRegistry
from app.plugins.renderer.card import CardRenderer
from app.plugins.renderer.file_export import FileExportRenderer
from app.plugins.renderer.image_table import ImageTableRenderer
from app.plugins.renderer.text_md import TextMarkdownRenderer

__all__ = [
    "CardRenderer",
    "FileExportRenderer",
    "ImageTableRenderer",
    "TextMarkdownRenderer",
    "register_builtin_renderers",
]


def register_builtin_renderers(registry: PluginRegistry) -> None:
    """将内置渲染器注册到 *registry*。"""
    registry.register(TextMarkdownRenderer())
    registry.register(ImageTableRenderer())
    registry.register(CardRenderer())
    registry.register(FileExportRenderer())
