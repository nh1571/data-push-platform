"""Built-in data-source plugins (MySQL, Doris, SQL Server, …)."""

from __future__ import annotations

from app.plugins.datasource.doris import DorisDataSourcePlugin
from app.plugins.datasource.mysql import MySQLDataSourcePlugin
from app.plugins.datasource.sqlserver import SQLServerDataSourcePlugin
from app.plugins.registry import PluginRegistry

__all__ = [
    "DorisDataSourcePlugin",
    "MySQLDataSourcePlugin",
    "SQLServerDataSourcePlugin",
    "register_builtin_datasources",
]


def register_builtin_datasources(registry: PluginRegistry) -> None:
    """Register built-in datasource plugins on *registry*."""
    registry.register(MySQLDataSourcePlugin())
    registry.register(DorisDataSourcePlugin())
    registry.register(SQLServerDataSourcePlugin())
