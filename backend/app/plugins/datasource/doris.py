"""Apache Doris data-source plugin (MySQL wire protocol, type name ``doris``)."""

from __future__ import annotations

from typing import Any

from app.plugins.base import QueryResult
from app.plugins.datasource.mysql import execute_mysql_compatible, validate_mysql_config


class DorisDataSourcePlugin:
    """DataSourcePlugin for Doris via the MySQL protocol (``type="doris"``).

    Shares connection / SQL execution helpers with
    :class:`~app.plugins.datasource.mysql.MySQLDataSourcePlugin` because Doris
    speaks the MySQL wire protocol. Registered under a separate type name so
    operators can distinguish Doris sources from plain MySQL.
    """

    @property
    def type(self) -> str:
        return "doris"

    def validate_config(self, config: dict[str, Any]) -> None:
        validate_mysql_config(config)

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        return execute_mysql_compatible(config, sql, params)
