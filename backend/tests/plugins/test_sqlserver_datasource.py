"""SQL Server datasource plugin unit tests (no live DB)."""

import pytest

from app.plugins.datasource.sqlserver import SQLServerDataSourcePlugin


def test_type_and_validate() -> None:
    p = SQLServerDataSourcePlugin()
    assert p.type == "sqlserver"
    with pytest.raises(ValueError, match="missing"):
        p.validate_config({})
    p.validate_config(
        {
            "host": "127.0.0.1",
            "port": 1433,
            "user": "sa",
            "password": "x",
            "database": "HealthOne",
        }
    )


def test_execute_without_pymssql(monkeypatch: pytest.MonkeyPatch) -> None:
    p = SQLServerDataSourcePlugin()
    config = {
        "host": "127.0.0.1",
        "port": 1433,
        "user": "sa",
        "password": "x",
        "database": "HealthOne",
    }

    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "pymssql":
            raise ImportError("no pymssql")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    with pytest.raises(RuntimeError, match="pymssql"):
        p.execute(config, "SELECT 1", {})
