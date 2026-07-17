"""SQLite datasource plugin (local demo)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from app.plugins.datasource.sqlite_ds import SQLiteDataSourcePlugin


def test_sqlite_execute_demo(tmp_path: Path) -> None:
    db = tmp_path / "t.db"
    conn = sqlite3.connect(str(db))
    conn.execute("CREATE TABLE t (a TEXT, b INT)")
    conn.execute("INSERT INTO t VALUES ('x', 1), ('y', 2)")
    conn.commit()
    conn.close()

    plugin = SQLiteDataSourcePlugin()
    assert plugin.type == "sqlite"
    result = plugin.execute({"path": str(db)}, "SELECT a, b FROM t ORDER BY b", {})
    assert result.columns == ["a", "b"]
    assert result.rows == [["x", 1], ["y", 2]]


def test_sqlite_param_sub(tmp_path: Path) -> None:
    db = tmp_path / "t.db"
    conn = sqlite3.connect(str(db))
    conn.execute("CREATE TABLE t (d TEXT, v INT)")
    conn.execute("INSERT INTO t VALUES ('2026-07-16', 10)")
    conn.commit()
    conn.close()

    plugin = SQLiteDataSourcePlugin()
    result = plugin.execute(
        {"path": str(db)},
        "SELECT v FROM t WHERE d = '{{yesterday}}'",
        {"yesterday": "2026-07-16"},
    )
    assert result.rows == [[10]]
