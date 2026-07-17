"""SQLite data-source plugin for local/demo business queries (stdlib only)."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from app.plugins.base import QueryResult
from app.plugins.datasource.mysql import substitute_sql_params

_DEFAULT_MAX_ROWS = 10_000


class SQLiteDataSourcePlugin:
    """``type="sqlite"`` — file path in config ``path`` (or ``database``)."""

    @property
    def type(self) -> str:
        return "sqlite"

    def validate_config(self, config: dict[str, Any]) -> None:
        path = config.get("path") or config.get("database") or config.get("db_path")
        if not path:
            raise ValueError("sqlite datasource requires config.path (file path)")

    def execute(
        self,
        config: dict[str, Any],
        sql: str,
        params: dict[str, Any],
    ) -> QueryResult:
        self.validate_config(config)
        path = str(config.get("path") or config.get("database") or config.get("db_path"))
        max_rows = int(config.get("max_rows", _DEFAULT_MAX_ROWS))
        rendered = substitute_sql_params(sql, params)
        # Resolve relative paths from backend CWD
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
