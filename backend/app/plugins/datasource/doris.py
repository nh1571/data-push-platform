"""Apache Doris 数据源插件（MySQL 线协议，type 名为 ``doris``）。"""

from __future__ import annotations

from typing import Any

from app.plugins.base import QueryResult
from app.plugins.datasource.mysql import execute_mysql_compatible, validate_mysql_config


class DorisDataSourcePlugin:
    """Doris 数据源插件（``type="doris"``，走 MySQL 协议）。

    与 :class:`~app.plugins.datasource.mysql.MySQLDataSourcePlugin` 共用
    连接与 SQL 执行辅助函数，因 Doris 兼容 MySQL 线协议。单独 type 名
    便于运维在控制台区分 Doris 与普通 MySQL 源。
    """

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "doris"

    def validate_config(self, config: dict[str, Any]) -> None:
        """复用 MySQL 配置校验（host/port/user/password/database）。"""
        validate_mysql_config(config)

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        """经 MySQL 兼容路径执行查询。"""
        return execute_mysql_compatible(config, sql, params)
