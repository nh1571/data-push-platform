"""MySQL 数据源插件（亦作为 Doris 的连接/执行辅助）。

提供：
- ``substitute_sql_params``：将 SQL 中 ``{{param}}`` 替换为运行参数
- ``validate_mysql_config`` / ``execute_mysql_compatible``：MySQL 协议共用逻辑
- ``MySQLDataSourcePlugin``：注册 type=``mysql``
"""

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

# 匹配 ``{{param_name}}`` 占位符（仅 word 字符）
_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")


def substitute_sql_params(sql: str, params: dict[str, Any]) -> str:
    """用 *params* 替换 *sql* 中的 ``{{param_name}}`` 占位符。

    常见占位符：

    - ``{{biz_date}}`` — 业务日期分区/过滤值
    - ``{{param_name}}`` — params 字典中的任意命名参数

    仅替换 *params* 中存在的键；未知占位符原样保留。
    值经 ``str(...)`` 简单字符串替换，**非** prepared statement 绑定。
    """

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key in params:
            return str(params[key])
        return match.group(0)

    return _PLACEHOLDER_RE.sub(_replace, sql)


def validate_mysql_config(config: dict[str, Any]) -> None:
    """校验 MySQL/Doris 连接必填字段；缺失则 ``ValueError``。"""
    missing = [key for key in _REQUIRED_CONFIG_KEYS if key not in config or config[key] is None]
    if missing:
        raise ValueError(f"missing required config keys: {', '.join(missing)}")


def execute_mysql_compatible(
    config: dict[str, Any],
    sql: str,
    params: dict[str, Any],
) -> QueryResult:
    """经 MySQL 协议连接、执行 *sql*，返回截断后的 ``QueryResult``。

    配置键：

    - 必填：``host``、``port``、``user``、``password``、``database``
    - 可选：``charset``（默认 ``utf8mb4``）、``max_rows``（默认 10000）

    ``max_rows`` 在 fetch 时截断，避免无界结果集撑爆内存。
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
            # 在 fetch 阶段截断到 max_rows，避免加载无界结果集
            raw_rows = cursor.fetchmany(max_rows) if max_rows > 0 else []
            rows: list[list[Any]] = [list(row) for row in raw_rows]
            return QueryResult(columns=columns, rows=rows)
    finally:
        conn.close()


class MySQLDataSourcePlugin:
    """MySQL 数据源插件实现（``type="mysql"``）。"""

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "mysql"

    def validate_config(self, config: dict[str, Any]) -> None:
        """校验连接配置。"""
        validate_mysql_config(config)

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        """执行查询并返回表格结果。"""
        return execute_mysql_compatible(config, sql, params)
