"""Built-in data-source plugins (MySQL, Doris, …)."""

from __future__ import annotations

from app.plugins.datasource.doris import DorisDataSourcePlugin
from app.plugins.datasource.mysql import MySQLDataSourcePlugin
from app.plugins.registry import PluginRegistry

__all__ = [
    "DorisDataSourcePlugin",
    "MySQLDataSourcePlugin",
    "register_builtin_datasources",
]


def register_builtin_datasources(registry: PluginRegistry) -> None:
    """Register built-in MySQL and Doris datasource plugins on *registry*."""
    registry.register(MySQLDataSourcePlugin())
    registry.register(DorisDataSourcePlugin())
