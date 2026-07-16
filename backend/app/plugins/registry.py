"""In-process plugin registry for datasources, renderers, and channels."""

from __future__ import annotations

from typing import Any, Literal

from app.plugins.base import ChannelPlugin, DataSourcePlugin, RendererPlugin

PluginKind = Literal["datasource", "renderer", "channel"]

_VALID_KINDS: frozenset[str] = frozenset({"datasource", "renderer", "channel"})


class PluginRegistry:
    """Register and look up plugins by kind + type name."""

    def __init__(self) -> None:
        self._plugins: dict[str, dict[str, Any]] = {
            "datasource": {},
            "renderer": {},
            "channel": {},
        }

    def register(self, plugin: DataSourcePlugin | RendererPlugin | ChannelPlugin) -> None:
        """Register a plugin; kind is inferred from its interface."""
        kind = self._infer_kind(plugin)
        type_name = plugin.type
        if not type_name:
            raise ValueError("plugin.type must be a non-empty string")
        self._plugins[kind][type_name] = plugin

    def get(self, kind: PluginKind | str, type_name: str) -> Any:
        """Return a registered plugin or raise KeyError."""
        if kind not in _VALID_KINDS:
            raise ValueError(
                f"unknown plugin kind {kind!r}; expected one of {sorted(_VALID_KINDS)}"
            )
        try:
            return self._plugins[kind][type_name]
        except KeyError as exc:
            raise KeyError(f"no {kind} plugin registered for type {type_name!r}") from exc

    def list_types(self, kind: PluginKind | str) -> list[str]:
        """List registered type names for a kind."""
        if kind not in _VALID_KINDS:
            raise ValueError(
                f"unknown plugin kind {kind!r}; expected one of {sorted(_VALID_KINDS)}"
            )
        return sorted(self._plugins[kind].keys())

    @staticmethod
    def _infer_kind(plugin: object) -> PluginKind:
        # Prefer structural markers so Protocol duck-types work without ABC inheritance.
        if hasattr(plugin, "execute") and callable(getattr(plugin, "execute")):
            return "datasource"
        if hasattr(plugin, "render") and callable(getattr(plugin, "render")):
            return "renderer"
        if hasattr(plugin, "send") and callable(getattr(plugin, "send")):
            return "channel"
        raise TypeError(
            "plugin must implement DataSourcePlugin, RendererPlugin, or ChannelPlugin"
        )


# Process-wide default registry (concrete plugins register at import time later).
plugin_registry = PluginRegistry()
