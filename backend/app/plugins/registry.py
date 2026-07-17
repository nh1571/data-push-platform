"""进程内插件注册表：按 kind + type 名注册与查找。

kind 取值：``datasource`` | ``renderer`` | ``channel``。
注册时根据实例是否具备 ``execute`` / ``render`` / ``send`` 自动推断 kind。

全局单例 ``plugin_registry`` 在 API 与 Celery worker 启动时分别填充内置插件。
"""

from __future__ import annotations

from typing import Any, Literal

from app.plugins.base import ChannelPlugin, DataSourcePlugin, RendererPlugin

PluginKind = Literal["datasource", "renderer", "channel"]

_VALID_KINDS: frozenset[str] = frozenset({"datasource", "renderer", "channel"})


class PluginRegistry:
    """按 kind + type 名称注册与查找插件。"""

    def __init__(self) -> None:
        """初始化三类空桶。"""
        self._plugins: dict[str, dict[str, Any]] = {
            "datasource": {},
            "renderer": {},
            "channel": {},
        }

    def register(self, plugin: DataSourcePlugin | RendererPlugin | ChannelPlugin) -> None:
        """注册插件；kind 由其接口方法推断。同 type 名后写覆盖先写。"""
        kind = self._infer_kind(plugin)
        type_name = plugin.type
        if not type_name:
            raise ValueError("plugin.type must be a non-empty string")
        self._plugins[kind][type_name] = plugin

    def get(self, kind: PluginKind | str, type_name: str) -> Any:
        """返回已注册插件；kind 非法抛 ValueError，未找到抛 KeyError。"""
        if kind not in _VALID_KINDS:
            raise ValueError(
                f"unknown plugin kind {kind!r}; expected one of {sorted(_VALID_KINDS)}"
            )
        try:
            return self._plugins[kind][type_name]
        except KeyError as exc:
            raise KeyError(f"no {kind} plugin registered for type {type_name!r}") from exc

    def list_types(self, kind: PluginKind | str) -> list[str]:
        """列出某 kind 下已注册的 type 名称（排序后）。"""
        if kind not in _VALID_KINDS:
            raise ValueError(
                f"unknown plugin kind {kind!r}; expected one of {sorted(_VALID_KINDS)}"
            )
        return sorted(self._plugins[kind].keys())

    @staticmethod
    def _infer_kind(plugin: object) -> PluginKind:
        """通过结构标记推断 kind，使 Protocol duck-type 无需 ABC 继承。"""
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


# 进程级默认注册表（具体插件在启动路径中 register）
plugin_registry = PluginRegistry()
