"""Compile response exposes resolved SQL params for workbench preview."""

from __future__ import annotations

from app.modules.studio.sql_params import extract_placeholders, resolve_sql_params


def test_extract_and_resolve_filters_to_used_names() -> None:
    sql = "SELECT * FROM t WHERE d = {{yesterday}} AND x = {{biz_date}}"
    _sql, resolved = resolve_sql_params(sql, param_defs=[], overrides={})
    used = set(extract_placeholders(sql))
    assert "yesterday" in used
    assert "biz_date" in used
    display = {k: str(resolved.get(k, "")) for k in sorted(used)}
    assert display["yesterday"]
    assert display["biz_date"]
    assert "this_month_start" not in display
