"""MySQL data-source plugin (also used as connection helper for Doris)."""

from __future__ import annotations

import re
from typing import Any

import pymysql
from pymysql.cursors import Cursor

from app.plugins.base import QueryResult

_REQUIRED_CONFIG_KEYS: tuple[str, ...] = (
    "host",
    "port",
    "user",
    "password",
    "database",
)

_DEFAULT_MAX_ROWS = 10_000
_DEFAULT_CHARSET = "utf8mb4"

# Matches ``{{param_name}}`` placeholders (word characters only).
_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")


def substitute_sql_params(sql: str, params: dict[str, Any]) -> str:
    """Replace ``{{param_name}}`` placeholders in *sql* using *params*.

    Supported placeholders (any key in *params*):

    - ``{{biz_date}}`` — typical business-date partition / filter value
    - ``{{param_name}}`` — any other named parameter from the params dict

    Only keys present in *params* are substituted; unknown placeholders are
    left unchanged. Values are converted with ``str(...)`` (simple string
    substitution, not prepared-statement binding).
    """

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key in params:
            return str(params[key])
        return match.group(0)

    return _PLACEHOLDER_RE.sub(_replace, sql)


def validate_mysql_config(config: dict[str, Any]) -> None:
    """Raise ``ValueError`` if required MySQL/Doris connection fields are missing."""
    missing = [key for key in _REQUIRED_CONFIG_KEYS if key not in config or config[key] is None]
    if missing:
        raise ValueError(f"missing required config keys: {', '.join(missing)}")


def execute_mysql_compatible(
    config: dict[str, Any],
    sql: str,
    params: dict[str, Any],
) -> QueryResult:
    """Connect via the MySQL protocol, run *sql*, return a truncated ``QueryResult``.

    Config keys:

    - required: ``host``, ``port``, ``user``, ``password``, ``database``
    - optional: ``charset`` (default ``utf8mb4``), ``max_rows`` (default 10000)
    """
    validate_mysql_config(config)

    max_rows = int(config.get("max_rows", _DEFAULT_MAX_ROWS))
    if max_rows < 0:
        raise ValueError("max_rows must be >= 0")

    rendered_sql = substitute_sql_params(sql, params)

    conn = pymysql.connect(
        host=config["host"],
        port=int(config["port"]),
        user=config["user"],
        password=config["password"],
        database=config["database"],
        charset=config.get("charset", _DEFAULT_CHARSET),
        cursorclass=Cursor,
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(rendered_sql)
            columns = (
                [str(col[0]) for col in cursor.description] if cursor.description else []
            )
            # Truncate to max_rows at fetch time to avoid loading unbounded result sets.
            raw_rows = cursor.fetchmany(max_rows) if max_rows > 0 else []
            rows: list[list[Any]] = [list(row) for row in raw_rows]
            return QueryResult(columns=columns, rows=rows)
    finally:
        conn.close()


class MySQLDataSourcePlugin:
    """DataSourcePlugin implementation for MySQL (``type="mysql"``)."""

    @property
    def type(self) -> str:
        return "mysql"

    def validate_config(self, config: dict[str, Any]) -> None:
        validate_mysql_config(config)

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        return execute_mysql_compatible(config, sql, params)
