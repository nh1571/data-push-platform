"""SQL 数据集参数解析。

架构意图
--------
数据源插件支持 SQL 中的 ``{{name}}`` 占位符替换；**本模块只负责生成 values 字典**，
不改写 SQL 字符串本身（返回的 sql 原样交给插件）。

参数来源（优先级由低到高）::

    内置 auto（today/yesterday/…）
      ← 数据集 param_defs（auto | static | runtime）
        ← 请求 overrides / 数据集 param_values

每次预览与正式推送都会重新解析 auto 日期，保证「昨天」等语义始终相对当前时刻。

时区默认 ``Asia/Shanghai``，符合国内院区/业务日切习惯；``biz_date`` 默认等同 yesterday。
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

# 仅匹配 {{word}}，与数据源插件占位符约定一致
_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")

# 国内企业业务日历默认时区
_DEFAULT_TZ = "Asia/Shanghai"

# 内置参数名 → auto kind；未在 resolved 中时自动注入
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
    """前端「自动参数」下拉目录（id / 中文 label / 示例值）。"""
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
    """解析时区；非法名称回退 Asia/Shanghai。"""
    try:
        return ZoneInfo(name or _DEFAULT_TZ)
    except Exception:
        return ZoneInfo(_DEFAULT_TZ)


def _month_end(d: date) -> date:
    """返回 ``d`` 所在自然月的最后一天。"""
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
    """将单个 auto kind 解析为格式化字符串。

    Parameters
    ----------
    kind:
        today / yesterday / biz_date / now / 本月起止 / 上月起止 / 近 N 天起点等。
    fmt:
        strftime 格式；日期默认 ``%Y-%m-%d``，now 默认带时分秒。
    now:
        可注入时钟（单测 / 回放）；默认当前时区时间。
    """
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
    # 未知 kind → 空串，避免注入脏值
    return ""


def extract_placeholders(sql: str) -> list[str]:
    """按出现顺序提取 SQL 中唯一的 ``{{name}}`` 键。"""
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
    """根据数据集参数定义 + overrides 生成字符串参数表。

    单条 def 字段约定::

        name, source|type: auto|static|runtime,
        auto|auto_kind, format, value, default
    """
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
            # 无 override 时用 default（可为空，提示运行时必填）
            default = p.get("default")
            out[name] = "" if default is None else str(default)
        else:
            # static
            val = p.get("value")
            if val is None:
                val = p.get("default")
            out[name] = "" if val is None else str(val)

    # 显式 overrides 最终覆盖（含 def 中未声明的键）
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
    """返回 ``(原样 sql, 已解析参数字典)``。

    真正的 ``{{name}}`` 替换由数据源插件完成；本函数只构建 values。
    ``inject_builtins=True`` 时为缺失的内置名补全 auto 值。
    """
    resolved = resolve_param_defs(
        param_defs, overrides=overrides, tz_name=tz_name, now=now
    )

    if inject_builtins:
        for name, kind in BUILTIN_AUTO.items():
            if name not in resolved:
                # 若 def 里声明了同名 format，沿用
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
    """UI 预览：展示占位符与解析结果，不执行 SQL。"""
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
