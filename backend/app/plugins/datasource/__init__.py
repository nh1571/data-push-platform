"""内置数据源插件：SQLite 演示、MySQL、Doris、SQL Server 等。"""

from __future__ import annotations

from app.plugins.datasource.doris import DorisDataSourcePlugin
from app.plugins.datasource.mysql import MySQLDataSourcePlugin
from app.plugins.datasource.sqlite_ds import SQLiteDataSourcePlugin
from app.plugins.datasource.sqlserver import SQLServerDataSourcePlugin
from app.plugins.registry import PluginRegistry

__all__ = [
    "DorisDataSourcePlugin",
    "MySQLDataSourcePlugin",
    "SQLiteDataSourcePlugin",
    "SQLServerDataSourcePlugin",
    "register_builtin_datasources",
]


def register_builtin_datasources(registry: PluginRegistry) -> None:
    """将内置数据源插件注册到 *registry*。"""
    registry.register(SQLiteDataSourcePlugin())
    registry.register(MySQLDataSourcePlugin())
    registry.register(DorisDataSourcePlugin())
    registry.register(SQLServerDataSourcePlugin())
