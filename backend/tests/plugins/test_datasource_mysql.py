"""Tests for MySQL / Doris datasource plugins (mocked pymysql; no real DB)."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.plugins.datasource import register_builtin_datasources
from app.plugins.datasource.doris import DorisDataSourcePlugin
from app.plugins.datasource.mysql import (
    MySQLDataSourcePlugin,
    substitute_sql_params,
)
from app.plugins.registry import PluginRegistry

_BASE_CONFIG: dict[str, Any] = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "secret",
    "database": "analytics",
}


def _mock_connect(
    columns: list[str],
    rows: list[tuple[Any, ...]],
) -> MagicMock:
    """Build a pymysql.connect mock that returns *columns* / *rows*."""
    cursor = MagicMock()
    cursor.description = [(name,) for name in columns]
    cursor.fetchmany = MagicMock(return_value=rows)
    cursor.__enter__ = MagicMock(return_value=cursor)
    cursor.__exit__ = MagicMock(return_value=False)

    conn = MagicMock()
    conn.cursor.return_value = cursor
    conn.close = MagicMock()
    return conn


class TestSubstituteSqlParams:
    def test_biz_date_substitution(self) -> None:
        sql = "SELECT * FROM t WHERE dt = '{{biz_date}}'"
        assert (
            substitute_sql_params(sql, {"biz_date": "2026-07-15"})
            == "SELECT * FROM t WHERE dt = '2026-07-15'"
        )

    def test_named_param_substitution(self) -> None:
        sql = "SELECT * FROM t WHERE region = '{{region}}' AND dt = '{{biz_date}}'"
        out = substitute_sql_params(
            sql, {"region": "cn", "biz_date": "2026-01-01"}
        )
        assert out == "SELECT * FROM t WHERE region = 'cn' AND dt = '2026-01-01'"

    def test_unknown_placeholder_left_intact(self) -> None:
        sql = "SELECT '{{missing}}' AS x"
        assert substitute_sql_params(sql, {}) == "SELECT '{{missing}}' AS x"


class TestMySQLDataSourcePlugin:
    def test_type(self) -> None:
        assert MySQLDataSourcePlugin().type == "mysql"

    def test_validate_config_requires_fields(self) -> None:
        plugin = MySQLDataSourcePlugin()
        with pytest.raises(ValueError, match="missing required config keys"):
            plugin.validate_config({"host": "localhost"})

        plugin.validate_config(_BASE_CONFIG)  # no raise

    @patch("app.plugins.datasource.mysql.pymysql.connect")
    def test_execute_returns_columns_and_rows(self, mock_connect: MagicMock) -> None:
        mock_connect.return_value = _mock_connect(
            columns=["id", "name"],
            rows=[(1, "alice"), (2, "bob")],
        )
        plugin = MySQLDataSourcePlugin()
        result = plugin.execute(_BASE_CONFIG, "SELECT id, name FROM users", {})

        assert result.columns == ["id", "name"]
        assert result.rows == [[1, "alice"], [2, "bob"]]
        mock_connect.assert_called_once()
        call_kwargs = mock_connect.call_args.kwargs
        assert call_kwargs["host"] == "localhost"
        assert call_kwargs["port"] == 3306
        assert call_kwargs["database"] == "analytics"
        mock_connect.return_value.close.assert_called_once()

    @patch("app.plugins.datasource.mysql.pymysql.connect")
    def test_max_rows_truncation(self, mock_connect: MagicMock) -> None:
        # Driver is asked for at most max_rows; simulate returning that many.
        many_rows = [(i,) for i in range(5)]
        conn = _mock_connect(columns=["id"], rows=many_rows)
        mock_connect.return_value = conn

        config = {**_BASE_CONFIG, "max_rows": 5}
        plugin = MySQLDataSourcePlugin()
        result = plugin.execute(config, "SELECT id FROM t", {})

        cursor = conn.cursor.return_value
        cursor.fetchmany.assert_called_once_with(5)
        assert len(result.rows) == 5
        assert result.rows[0] == [0]
        assert result.rows[-1] == [4]

    @patch("app.plugins.datasource.mysql.pymysql.connect")
    def test_biz_date_substitution_in_execute(
        self, mock_connect: MagicMock
    ) -> None:
        conn = _mock_connect(columns=["cnt"], rows=[(3,)])
        mock_connect.return_value = conn

        plugin = MySQLDataSourcePlugin()
        plugin.execute(
            _BASE_CONFIG,
            "SELECT COUNT(*) AS cnt FROM events WHERE dt = '{{biz_date}}'",
            {"biz_date": "2026-07-15"},
        )

        cursor = conn.cursor.return_value
        executed_sql = cursor.execute.call_args[0][0]
        assert executed_sql == (
            "SELECT COUNT(*) AS cnt FROM events WHERE dt = '2026-07-15'"
        )
        assert "{{biz_date}}" not in executed_sql


class TestDorisDataSourcePlugin:
    def test_type_is_doris(self) -> None:
        assert DorisDataSourcePlugin().type == "doris"

    @patch("app.plugins.datasource.mysql.pymysql.connect")
    def test_execute_returns_columns_and_rows(self, mock_connect: MagicMock) -> None:
        mock_connect.return_value = _mock_connect(
            columns=["id"],
            rows=[(42,)],
        )
        plugin = DorisDataSourcePlugin()
        result = plugin.execute(_BASE_CONFIG, "SELECT 42 AS id", {})
        assert result.columns == ["id"]
        assert result.rows == [[42]]


class TestRegisterBuiltinDatasources:
    def test_registers_mysql_and_doris(self) -> None:
        registry = PluginRegistry()
        register_builtin_datasources(registry)

        assert set(registry.list_types("datasource")) == {"doris", "mysql"}
        assert registry.get("datasource", "mysql").type == "mysql"
        assert registry.get("datasource", "doris").type == "doris"
