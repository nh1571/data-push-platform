"""SQL auto-parameter resolution tests."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.modules.studio.sql_params import (
    extract_placeholders,
    resolve_auto_kind,
    resolve_sql_params,
)
from app.plugins.datasource.mysql import substitute_sql_params


def test_yesterday_auto() -> None:
    fixed = datetime(2026, 7, 17, 10, 0, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
    assert resolve_auto_kind("yesterday", now=fixed) == "2026-07-16"
    assert resolve_auto_kind("today", now=fixed) == "2026-07-17"
    assert resolve_auto_kind("biz_date", now=fixed) == "2026-07-16"
    assert resolve_auto_kind("this_month_start", now=fixed) == "2026-07-01"


def test_resolve_sql_params_builtins_and_defs() -> None:
    sql = "SELECT * FROM t WHERE dt >= '{{start_date}}' AND dt <= '{{today}}'"
    fixed = datetime(2026, 7, 17, 10, 0, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
    _, resolved = resolve_sql_params(
        sql,
        param_defs=[
            {
                "name": "start_date",
                "source": "auto",
                "auto": "yesterday",
                "format": "%Y-%m-%d",
            }
        ],
        overrides={},
        now=fixed,
    )
    assert resolved["start_date"] == "2026-07-16"
    assert resolved["today"] == "2026-07-17"
    rendered = substitute_sql_params(sql, resolved)
    assert rendered == "SELECT * FROM t WHERE dt >= '2026-07-16' AND dt <= '2026-07-17'"
    assert extract_placeholders(sql) == ["start_date", "today"]


def test_substitute_only_known() -> None:
    sql = "SELECT {{a}}, {{missing}}"
    out = substitute_sql_params(sql, {"a": "1"})
    assert out == "SELECT 1, {{missing}}"


def test_override_wins() -> None:
    _, resolved = resolve_sql_params(
        "SELECT '{{biz_date}}'",
        param_defs=[{"name": "biz_date", "source": "auto", "auto": "yesterday"}],
        overrides={"biz_date": "2020-01-01"},
    )
    assert resolved["biz_date"] == "2020-01-01"
    assert substitute_sql_params("SELECT '{{biz_date}}'", resolved) == "SELECT '2020-01-01'"
