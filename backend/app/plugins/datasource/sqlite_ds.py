"""SQLite 数据源插件：本地/演示业务库查询（仅标准库 sqlite3）。"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from app.plugins.base import QueryResult
from app.plugins.datasource.mysql import substitute_sql_params

_DEFAULT_MAX_ROWS = 10_000


class SQLiteDataSourcePlugin:
    """``type="sqlite"`` — 配置中文件路径字段为 ``path``（或 ``database`` / ``db_path``）。

    相对路径相对进程 CWD（通常为 backend 工作目录）解析；
    支持与 MySQL 插件相同的 ``{{param}}`` SQL 占位符替换。
    """

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "sqlite"

    def validate_config(self, config: dict[str, Any]) -> None:
        """要求至少提供 path / database / db_path 之一。"""
        path = config.get("path") or config.get("database") or config.get("db_path")
        if not path:
            raise ValueError("sqlite datasource requires config.path (file path)")

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        """打开 SQLite 文件、执行 SQL，按 max_rows 截断返回。"""
        self.validate_config(config)
        path = str(config.get("path") or config.get("database") or config.get("db_path"))
        max_rows = int(config.get("max_rows", _DEFAULT_MAX_ROWS))
        rendered = substitute_sql_params(sql, params)
        # 相对路径从 backend CWD 解析
        db_path = Path(path).expanduser()
        if not db_path.is_absolute():
            db_path = Path.cwd() / db_path
        if not db_path.is_file():
            raise FileNotFoundError(f"sqlite database not found: {db_path}")

        conn = sqlite3.connect(str(db_path))
        try:
            conn.row_factory = None
            cur = conn.cursor()
            cur.execute(rendered)
            columns = [str(d[0]) for d in (cur.description or [])]
            raw = cur.fetchmany(max_rows) if max_rows > 0 else []
            rows: list[list[Any]] = [list(r) for r in raw]
            return QueryResult(columns=columns, rows=rows)
        finally:
            conn.close()
