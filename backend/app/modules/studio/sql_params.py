"""SQL parameter resolution for datasets.

SQL may contain ``{{name}}`` placeholders (already supported by datasource plugins).
This module produces the *values* dict, including:

- **Built-in auto params** always available: today / yesterday / now / …
- **Dataset-defined params**: auto | static | runtime (override)

Each push / preview re-resolves auto values so times stay fresh.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")

# Default timezone for business calendars in CN enterprises
_DEFAULT_TZ = "Asia/Shanghai"

# Built-in names always injected unless overridden
BUILTIN_AUTO: dict[str, str] = {
    "today": "today",
    "yesterday": "yesterday",
    "tomorrow": "tomorrow",
    "now": "now",
    "biz_date": "yesterday",  # common BI partition alias
    "this_month_start": "this_month_start",
    "this_month_end": "this_month_end",
    "last_month_start": "last_month_start",
    "last_month_end": "last_month_end",
    "last_7_days_start": "last_7_days_start",
    "last_30_days_start": "last_30_days_start",
}


def list_auto_kinds() -> list[dict[str, str]]:
    """UI catalog for auto parameter kinds."""
    return [
        {"id": "today", "label": "今天", "example": "2026-07-17"},
        {"id": "yesterday", "label": "昨天", "example": "2026-07-16"},
        {"id": "tomorrow", "label": "明天", "example": "2026-07-18"},
        {"id": "now", "label": "当前时间", "example": "2026-07-17 12:00:00"},
        {"id": "this_month_start", "label": "本月1日", "example": "2026-07-01"},
        {"id": "this_month_end", "label": "本月最后一天", "example": "2026-07-31"},
        {"id": "last_month_start", "label": "上月1日", "example": "2026-06-01"},
        {"id": "last_month_end", "label": "上月最后一天", "example": "2026-06-30"},
        {"id": "last_7_days_start", "label": "近7天起点", "example": "2026-07-10"},
        {"id": "last_30_days_start", "label": "近30天起点", "example": "2026-06-17"},
    ]


def _tz(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or _DEFAULT_TZ)
    except Exception:
        return ZoneInfo(_DEFAULT_TZ)


def _month_end(d: date) -> date:
    if d.month == 12:
        return date(d.year, 12, 31)
    return date(d.year, d.month + 1, 1) - timedelta(days=1)


def resolve_auto_kind(
    kind: str,
    *,
    fmt: str | None = None,
    tz_name: str | None = None,
    now: datetime | None = None,
) -> str:
    """Resolve a single auto kind to string."""
    tz = _tz(tz_name)
    now = now or datetime.now(tz)
    if now.tzinfo is None:
        now = now.replace(tzinfo=tz)
    else:
        now = now.astimezone(tz)
    today = now.date()
    kind = (kind or "").strip().lower()

    date_fmt = fmt or "%Y-%m-%d"
    dt_fmt = fmt or "%Y-%m-%d %H:%M:%S"

    if kind in ("today",):
        return today.strftime(date_fmt)
    if kind in ("yesterday", "biz_date"):
        return (today - timedelta(days=1)).strftime(date_fmt)
    if kind == "tomorrow":
        return (today + timedelta(days=1)).strftime(date_fmt)
    if kind == "now":
        return now.strftime(dt_fmt)
    if kind == "this_month_start":
        return date(today.year, today.month, 1).strftime(date_fmt)
    if kind == "this_month_end":
        return _month_end(today).strftime(date_fmt)
    if kind == "last_month_start":
        first = date(today.year, today.month, 1)
        last_month_last = first - timedelta(days=1)
        return date(last_month_last.year, last_month_last.month, 1).strftime(date_fmt)
    if kind == "last_month_end":
        first = date(today.year, today.month, 1)
        return (first - timedelta(days=1)).strftime(date_fmt)
    if kind == "last_7_days_start":
        return (today - timedelta(days=6)).strftime(date_fmt)
    if kind == "last_30_days_start":
        return (today - timedelta(days=29)).strftime(date_fmt)
    # unknown kind — empty
    return ""


def extract_placeholders(sql: str) -> list[str]:
    """Ordered unique ``{{name}}`` keys in SQL."""
    seen: list[str] = []
    for m in _PLACEHOLDER_RE.finditer(sql or ""):
        name = m.group(1)
        if name not in seen:
            seen.append(name)
    return seen


def resolve_param_defs(
    param_defs: list[dict[str, Any]] | None,
    *,
    overrides: dict[str, Any] | None = None,
    tz_name: str | None = None,
    now: datetime | None = None,
) -> dict[str, str]:
    """Resolve dataset param definitions + overrides to string map."""
    out: dict[str, str] = {}
    overrides = dict(overrides or {})

    for p in param_defs or []:
        if not isinstance(p, dict):
            continue
        name = str(p.get("name") or "").strip()
        if not name:
            continue
        if name in overrides and overrides[name] is not None and str(overrides[name]) != "":
            out[name] = str(overrides[name])
            continue
        source = str(p.get("source") or p.get("type") or "static").lower()
        fmt = p.get("format")
        fmt_s = str(fmt) if fmt else None
        if source == "auto":
            kind = str(p.get("auto") or p.get("auto_kind") or "yesterday")
            out[name] = resolve_auto_kind(kind, fmt=fmt_s, tz_name=tz_name, now=now)
        elif source == "runtime":
            # default when no override
            default = p.get("default")
            out[name] = "" if default is None else str(default)
        else:
            # static
            val = p.get("value")
            if val is None:
                val = p.get("default")
            out[name] = "" if val is None else str(val)

    # explicit overrides always win
    for k, v in overrides.items():
        if v is not None and str(v) != "":
            out[str(k)] = str(v)
    return out


def resolve_sql_params(
    sql: str,
    *,
    param_defs: list[dict[str, Any]] | None = None,
    overrides: dict[str, Any] | None = None,
    inject_builtins: bool = True,
    tz_name: str | None = None,
    now: datetime | None = None,
) -> tuple[str, dict[str, str]]:
    """Return (sql_unchanged_for_plugin, resolved_params_dict).

    The datasource plugin performs the actual ``{{name}}`` substitution;
    this only builds the values map. Built-ins fill any missing keys used in SQL.
    """
    resolved = resolve_param_defs(
        param_defs, overrides=overrides, tz_name=tz_name, now=now
    )

    if inject_builtins:
        for name, kind in BUILTIN_AUTO.items():
            if name not in resolved:
                # prefer matching def format if any
                fmt = None
                for p in param_defs or []:
                    if isinstance(p, dict) and str(p.get("name")) == name:
                        fmt = p.get("format")
                        break
                resolved[name] = resolve_auto_kind(
                    kind, fmt=str(fmt) if fmt else None, tz_name=tz_name, now=now
                )

    return sql, resolved


def preview_resolved_params(
    sql: str,
    param_defs: list[dict[str, Any]] | None = None,
    overrides: dict[str, Any] | None = None,
    tz_name: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """For UI: show placeholders + resolved values without running SQL."""
    _, resolved = resolve_sql_params(
        sql, param_defs=param_defs, overrides=overrides, tz_name=tz_name, now=now
    )
    used = extract_placeholders(sql)
    return {
        "placeholders": used,
        "resolved": {k: resolved.get(k, "") for k in used},
        "all_resolved": resolved,
        "builtins": {
            k: resolve_auto_kind(v, tz_name=tz_name, now=now) for k, v in BUILTIN_AUTO.items()
        },
        "auto_kinds": list_auto_kinds(),
    }
