"""PluginRegistry registration and lookup."""

from __future__ import annotations

from typing import Any

import pytest

from app.plugins.base import Message, QueryResult
from app.plugins.registry import PluginRegistry


class FakeDataSourcePlugin:
    """Minimal DataSourcePlugin for registry tests."""

    @property
    def type(self) -> str:
        return "fake_ds"

    def validate_config(self, config: dict[str, Any]) -> None:
        if "host" not in config:
            raise ValueError("host required")

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        return QueryResult(columns=["id"], rows=[[1]])


class FakeRendererPlugin:
    @property
    def type(self) -> str:
        return "fake_renderer"

    def render(
        self,
        result: QueryResult,
        config: dict[str, Any],
        params: dict[str, Any],
    ) -> list:
        return []


class FakeChannelPlugin:
    @property
    def type(self) -> str:
        return "fake_channel"

    def validate_config(self, config: dict[str, Any]) -> None:
        return None

    def send(self, config: dict[str, Any], message: Message):
        from app.plugins.base import DeliveryResult

        return DeliveryResult(success=True, provider_msg_id="msg-1")


def test_register_and_get_datasource() -> None:
    registry = PluginRegistry()
    plugin = FakeDataSourcePlugin()
    registry.register(plugin)

    got = registry.get("datasource", "fake_ds")
    assert got is plugin
    assert got.type == "fake_ds"

    result = got.execute({"host": "localhost"}, "SELECT 1", {})
    assert result.columns == ["id"]
    assert result.rows == [[1]]


def test_register_renderer_and_channel() -> None:
    registry = PluginRegistry()
    registry.register(FakeRendererPlugin())
    registry.register(FakeChannelPlugin())

    assert registry.get("renderer", "fake_renderer").type == "fake_renderer"
    assert registry.get("channel", "fake_channel").type == "fake_channel"


def test_get_missing_raises() -> None:
    registry = PluginRegistry()
    with pytest.raises(KeyError, match="fake_ds"):
        registry.get("datasource", "fake_ds")


def test_unknown_kind_raises() -> None:
    registry = PluginRegistry()
    with pytest.raises(ValueError, match="unknown plugin kind"):
        registry.get("unknown", "x")
