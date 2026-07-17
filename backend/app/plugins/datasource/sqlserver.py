"""SQL Server 数据源插件（医院 HIS / ODS 等遗留源）。

依赖可选包 ``pymssql``；未安装时在 execute 阶段给出明确 RuntimeError 提示。
"""

from __future__ import annotations

from typing import Any

from app.plugins.base import QueryResult
from app.plugins.datasource.mysql import substitute_sql_params

_REQUIRED = ("host", "port", "user", "password", "database")
_DEFAULT_MAX_ROWS = 10_000


class SQLServerDataSourcePlugin:
    """DataSourcePlugin，``type=sqlserver``，经 pymssql 连接。

    配置键：
    - 必填：host, port, user, password, database
    - 可选：max_rows、login_timeout、query_timeout、charset
    """

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "sqlserver"

    def validate_config(self, config: dict[str, Any]) -> None:
        """校验必填连接字段（空字符串视为缺失）。"""
        missing = [k for k in _REQUIRED if k not in config or config[k] is None or config[k] == ""]
        if missing:
            raise ValueError(f"missing required config keys: {', '.join(missing)}")

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        """连接 SQL Server、替换占位符、分批 fetch 至 max_rows。"""
        self.validate_config(config)
        try:
            import pymssql
        except ImportError as exc:
            raise RuntimeError(
                "pymssql is not installed; pip install pymssql to use sqlserver sources"
            ) from exc

        max_rows = int(config.get("max_rows", _DEFAULT_MAX_ROWS))
        if max_rows < 0:
            raise ValueError("max_rows must be >= 0")

        rendered = substitute_sql_params(sql, params or {})
        conn = pymssql.connect(
            server=str(config["host"]),
            port=str(config.get("port") or 1433),
            user=str(config["user"]),
            password=str(config["password"]),
            database=str(config["database"]),
            login_timeout=int(config.get("login_timeout", 15)),
            timeout=int(config.get("query_timeout", 120)),
            charset=str(config.get("charset") or "utf8"),
        )
        try:
            with conn.cursor() as cur:
                cur.execute(rendered)
                if cur.description is None:
                    return QueryResult(columns=[], rows=[])
                columns = [str(d[0]) for d in cur.description]
                rows: list[list[Any]] = []
                while len(rows) < max_rows:
                    batch = cur.fetchmany(min(500, max_rows - len(rows)))
                    if not batch:
                        break
                    for row in batch:
                        rows.append(list(row))
                return QueryResult(columns=columns, rows=rows)
        finally:
            conn.close()
