"""画板编译器：组件树 → HTML / Markdown / PNG / 出站 Message。

架构职责
--------
Studio 的**核心渲染引擎**。输入为 artboard v3 文档 + 多数据集查询结果
（``data_ctx: dataset_id → QueryResult``），输出：

1. **HTML**：完整可截图的文档（含主题 CSS、顶栏 chrome、组件树）
2. **Markdown**：组件树投影的纯文本（钉钉等渠道备用）
3. **PNG**：Playwright / wkhtmltoimage 对 ``#artboard`` 节点截图
4. **Message**：推送外壳（compose）+ 画板图/文，供 channel 插件发送

组件类型
--------
``Text`` / ``Kpi`` / ``Table`` / ``Chart`` / ``Alert`` / ``Container`` / ``Divider``。

布局
----
- **流式**（默认）：Container 按 column/row + gap 排布
- **自由画布**：子节点带 ``compose_x/y/w/h`` 时切换 absolute 定位

可见性
------
``visible`` 布尔 + ``visible_when`` 表达式（如 ``row_count>0``），按绑定数据集求值。

与 pipeline 的衔接
------------------
``execution.pipeline.render_message`` 在识别 artboard 后调用
:func:`artboard_to_message`；工作台预览走 :func:`compile_artboard`。
"""

from __future__ import annotations

import base64
import html
import math
import re
from dataclasses import dataclass, field
from typing import Any

from app.modules.studio.themes import resolve_theme, theme_css_vars
from app.plugins.base import Message, MessagePart, QueryResult

# 占位符：{{列名}}，允许内部空白；用于文本/KPI/顶栏等首行替换
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")
# 百分比单元格着色（同比/环比等）
_PERCENT_RE = re.compile(r"^\s*([+-]?\d+(?:\.\d+)?)\s*%\s*$")
# 表格默认截断行数，避免超长 HTML 拖垮截图
_MAX_ROWS = 50

_CSS = """
:root { --theme: #1677ff; --fg: #1f1f1f; --muted: #666; --border: #e5e5e5;
  --header-bg: #f5f7fa; --kpi-bg: #fafcff; --table-fs: 13px; --table-pad: 8px 10px; --table-hw: 600; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--fg);
  background: #f0f2f5;
}
.artboard {
  width: var(--ab-width, 750px);
  margin: 0 auto;
  background: #fff;
  padding: 0 0 18px;
  overflow: hidden;
  border-radius: 4px;
}
.artboard-chrome {
  background: var(--theme);
  color: #fff;
  padding: 12px 18px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
.artboard-chrome.alert { background: #ff4d4f; }
.artboard-body { padding: 16px 18px 4px; }
.artboard-body.free { padding: 0; position: relative; min-height: 200px; }
.comp-freeboard { position: relative; width: 100%; min-height: 200px; }
.comp-free {
  position: absolute;
  overflow: hidden;
  box-sizing: border-box;
}
.comp-free-inner {
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
.comp-free.card {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  background: #fff;
}
.comp-free.plain {
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}
.comp-free.border {
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  box-shadow: none;
  background: #fff;
}
.comp-free.shadow {
  border: none;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  background: #fff;
}
.comp-text-h1 {
  font-size: 20px;
  font-weight: 700;
  color: var(--theme);
  margin: 0 0 4px;
  line-height: 1.35;
}
.comp-text-body {
  font-size: 13px;
  color: var(--fg);
  margin: 0;
  line-height: 1.55;
  white-space: pre-wrap;
}
.comp-text-caption {
  font-size: 12px;
  color: var(--muted);
  margin: 4px 0 0;
  line-height: 1.45;
}
.comp-rich {
  font-size: 14px;
  color: var(--fg);
  line-height: 1.65;
  word-break: break-word;
}
.comp-rich p { margin: 0 0 0.6em; }
.comp-rich h1 { font-size: 22px; margin: 0 0 0.4em; color: var(--theme); }
.comp-rich h2 { font-size: 18px; margin: 0 0 0.4em; color: var(--theme); }
.comp-rich h3 { font-size: 15px; margin: 0 0 0.35em; font-weight: 600; }
.comp-rich ul, .comp-rich ol { margin: 0.3em 0 0.6em 1.2em; padding: 0; }
.comp-rich li { margin: 0.15em 0; }
.comp-rich a { color: var(--theme); }
.comp-rich strong { font-weight: 700; }
.comp-vstack { display: flex; flex-direction: column; gap: var(--gap, 12px); }
.comp-hstack { display: flex; flex-direction: row; gap: var(--gap, 8px); align-items: stretch; }
.comp-kpi {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  background: var(--kpi-bg);
  min-width: 0;
}
.comp-kpi .label { color: var(--muted); font-size: 12px; }
.comp-kpi .value { color: var(--theme); font-size: 26px; font-weight: 700; margin-top: 6px; word-break: break-all; }
table.comp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--table-fs);
}
table.comp-table th, table.comp-table td {
  border: 1px solid var(--border);
  padding: var(--table-pad);
  text-align: left;
  max-width: 180px;
  word-break: break-word;
}
table.comp-table th { background: var(--header-bg); font-weight: var(--table-hw); color: var(--fg); }
table.comp-table tr:nth-child(even) td { background: #fafbfc; }
table.comp-table.style-alert th { background: #fff1f0; color: #cf1322; }
table.comp-table.style-compact th, table.comp-table.style-compact td { max-width: 140px; }
.r-pos-strong { color: #005737; font-weight: 600; }
.r-pos { color: #00B050; font-weight: 600; }
.r-neg { color: #FF0000; font-weight: 600; }
.r-neg-strong { color: #900000; font-weight: 600; }
.comp-empty { color: var(--muted); font-size: 13px; }
.comp-chart { width: 100%; }
.comp-chart-title { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: var(--fg); }
.comp-chart-wrap { display: flex; justify-content: center; align-items: center; }
.comp-chart-legend {
  display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 8px; font-size: 12px; color: var(--muted);
}
.comp-chart-legend span { display: inline-flex; align-items: center; gap: 4px; }
.comp-chart-swatch {
  width: 10px; height: 10px; border-radius: 2px; display: inline-block;
}
.comp-alert {
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid #ffccc7;
  background: #fff2f0;
  color: #a8071a;
}
.comp-alert.info { border-color: #91caff; background: #e6f4ff; color: #0958d9; }
.comp-alert.success { border-color: #b7eb8f; background: #f6ffed; color: #389e0d; }
.comp-alert.warning { border-color: #ffe58f; background: #fffbe6; color: #d48806; }
"""


def _esc(value: Any) -> str:
    """HTML 转义；None 视为空串。"""
    if value is None:
        return ""
    return html.escape(str(value))


def _ratio_class(cell: str, *, enabled: bool) -> str:
    """百分比单元格 CSS 类：强正/正/负/强负（阈值 ±20%）。"""
    if not enabled:
        return ""
    m = _PERCENT_RE.match(cell.strip())
    if not m:
        return ""
    pct = float(m.group(1))
    if pct >= 20:
        return "r-pos-strong"
    if pct > 0:
        return "r-pos"
    if pct <= -20:
        return "r-neg-strong"
    if pct < 0:
        return "r-neg"
    return ""


def substitute_first_row(template: str, result: QueryResult | None) -> str:
    """用查询结果**首行**替换模板中的 ``{{列名}}`` 占位符。

    无数据或未知列 → 空串。画板文本、KPI 标签、chrome 标题、compose 外壳均依赖此逻辑。
    """
    if not template:
        return template
    if result is None or not result.rows:
        def empty(_m: re.Match[str]) -> str:
            return ""

        return _PLACEHOLDER_RE.sub(empty, template)

    columns = list(result.columns or [])
    first = list(result.rows[0])
    col_index = {name: i for i, name in enumerate(columns)}

    def repl(match: re.Match[str]) -> str:
        name = match.group(1).strip()
        idx = col_index.get(name)
        if idx is None or idx >= len(first):
            return ""
        value = first[idx]
        return "" if value is None else str(value)

    return _PLACEHOLDER_RE.sub(repl, template)


@dataclass
class CompileResult:
    """一次完整编译的产物，供工作台预览 API 序列化。

    属性
    ----------
    html:
        可直接 iframe / 截图的完整 HTML 文档。
    markdown:
        组件树投影的 Markdown（不含 compose 外壳）。
    message:
        含 compose 推送外壳的最终 Message（图+文）。
    image_base64 / image_path:
        PNG data URL 与本地存储路径；成图失败时为 None。
    row_count:
        主数据集（main）行数。
    parts_preview:
        Message 各 part 的短预览，便于 UI 列表展示。
    image_error:
        成图失败时的用户可读原因（如未装 Playwright）。
    """

    html: str
    markdown: str
    message: Message
    image_base64: str | None = None
    image_path: str | None = None
    row_count: int = 0
    parts_preview: list[dict[str, str]] = field(default_factory=list)
    image_error: str | None = None


def _get_dataset(
    data_ctx: dict[str, QueryResult],
    binding: dict[str, Any] | None,
    default_id: str = "main",
) -> QueryResult | None:
    """按节点 binding.dataset_id 取数；缺失时回退 data_ctx 中第一个数据集。"""
    binding = binding or {}
    ds_id = str(binding.get("dataset_id") or default_id)
    if ds_id in data_ctx:
        return data_ctx[ds_id]
    if data_ctx:
        return next(iter(data_ctx.values()))
    return None


def _eval_visible_when(expr: str, data_ctx: dict[str, QueryResult], binding: dict[str, Any]) -> bool:
    """安全子集可见性表达式求值（禁止任意代码执行）。

    支持::

        always / true / ""          → 始终显示
        never / false / hidden      → 始终隐藏
        row_count>0 / not_empty     → 有数据
        row_count==0 / empty        → 无数据
        row_count>=N / <=N / !=N 等  → 与行数比较

    针对节点绑定的数据集（默认 main）。未知表达式 **fail-open**（显示），
    避免设计者写错条件导致整板空白。
    """
    raw = (expr or "").strip().lower().replace(" ", "")
    if raw in ("", "always", "true", "1"):
        return True
    if raw in ("never", "false", "0", "hidden"):
        return False

    result = _get_dataset(data_ctx, binding)
    row_count = len(result.rows) if result and result.rows is not None else 0

    if raw in ("empty", "row_count==0", "row_count=0"):
        return row_count == 0
    if raw in ("not_empty", "row_count>0", "has_rows"):
        return row_count > 0

    m = re.match(r"row_count(>=|<=|==|=|!=|>|<)(\d+)", raw)
    if m:
        op, num_s = m.group(1), m.group(2)
        n = int(num_s)
        if op in ("==", "="):
            return row_count == n
        if op == "!=":
            return row_count != n
        if op == ">":
            return row_count > n
        if op == "<":
            return row_count < n
        if op == ">=":
            return row_count >= n
        if op == "<=":
            return row_count <= n
    # Unknown expression → show (fail open for designers)
    return True


def _visible(node: dict[str, Any], data_ctx: dict[str, QueryResult] | None = None) -> bool:
    """节点是否渲染：visible=false 优先；否则解析 visible_when。"""
    if node.get("visible", True) is False:
        return False
    props = dict(node.get("props") or {})
    binding = dict(node.get("binding") or {})
    # props.visible_when 优先于节点顶层 visible_when
    expr = props.get("visible_when")
    if expr is None:
        expr = node.get("visible_when")
    if expr is None or expr == "":
        return True
    return _eval_visible_when(str(expr), data_ctx or {}, binding)


def _looks_like_html(s: str) -> bool:
    """粗判是否富文本 HTML（含常见标签），用于 Text 组件分支。"""
    t = (s or "").strip().lower()
    return "<" in t and any(
        tag in t
        for tag in (
            "<p",
            "<div",
            "<h1",
            "<h2",
            "<h3",
            "<ul",
            "<ol",
            "<li",
            "<span",
            "<strong",
            "<em",
            "<br",
            "<a ",
        )
    )


def _strip_html(s: str) -> str:
    """去掉 HTML 标签，供 Markdown 投影使用。"""
    return re.sub(r"<[^>]+>", "", s or "")


def _render_text_html(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """渲染文本组件 HTML：先做 {{列}} 替换；富文本原样嵌入，纯文本按 variant 套样式。"""
    props = dict(node.get("props") or {})
    binding = dict(node.get("binding") or {})
    result = _get_dataset(data_ctx, binding)
    raw = str(props.get("html") or props.get("text") or "")
    text = substitute_first_row(raw, result)
    if _looks_like_html(text):
        return f"<div class='comp-rich'>{text}</div>"
    variant = str(props.get("variant") or "body")
    cls = {
        "h1": "comp-text-h1",
        "title": "comp-text-h1",
        "body": "comp-text-body",
        "caption": "comp-text-caption",
        "footer": "comp-text-caption",
        "rich": "comp-text-body",
    }.get(variant, "comp-text-body")
    tag = "h1" if cls == "comp-text-h1" else "p"
    return f"<{tag} class='{cls}'>{_esc(text)}</{tag}>"


def _render_text_md(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """文本组件的 Markdown 投影；富文本先剥标签，标题用 ##。"""
    props = dict(node.get("props") or {})
    binding = dict(node.get("binding") or {})
    result = _get_dataset(data_ctx, binding)
    raw = str(props.get("html") or props.get("text") or "")
    text = substitute_first_row(raw, result)
    if _looks_like_html(text):
        text = _strip_html(text)
    variant = str(props.get("variant") or "body")
    if variant in ("h1", "title"):
        return f"## {text}" if text else ""
    return text


def _resolve_kpi(
    node: dict[str, Any], data_ctx: dict[str, QueryResult]
) -> tuple[str, str]:
    """解析 KPI 标签与数值。

    绑定优先级：显式 value_column → auto_index 列序 → 首列。
    无行时返回破折号占位。
    """
    props = dict(node.get("props") or {})
    binding = dict(node.get("binding") or {})
    result = _get_dataset(data_ctx, binding)
    label = str(binding.get("label") or props.get("label") or "")
    col = str(binding.get("value_column") or "")
    auto_index = binding.get("auto_index")

    if result is None or not result.rows:
        return label or "—", "—"

    columns = list(result.columns or [])
    first = list(result.rows[0])
    if auto_index is not None and not col:
        try:
            i = int(auto_index)
            if 0 <= i < len(columns):
                col = columns[i]
                if not label:
                    label = col
        except (TypeError, ValueError):
            pass
    if not col and columns:
        col = columns[0]
        if not label:
            label = col
    idx = {name: i for i, name in enumerate(columns)}
    i = idx.get(col)
    val = first[i] if i is not None and i < len(first) else "—"
    if not label:
        label = col or "指标"
    return label, "" if val is None else str(val)


def _render_kpi_html(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """KPI 卡片 HTML。"""
    label, value = _resolve_kpi(node, data_ctx)
    return (
        f"<div class='comp-kpi'><div class='label'>{_esc(label)}</div>"
        f"<div class='value'>{_esc(value)}</div></div>"
    )


def _render_kpi_md(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """KPI 的 Markdown 一行：``**标签**: 值``。"""
    label, value = _resolve_kpi(node, data_ctx)
    return f"**{label}**: {value}"


def _render_table_html(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """数据表 HTML：可选列筛选、行截断、百分比着色、style 变体。"""
    props = dict(node.get("props") or {})
    binding = dict(node.get("binding") or {})
    result = _get_dataset(data_ctx, binding)
    if result is None:
        return "<p class='comp-empty'>（未绑定数据）</p>"
    color_ratios = props.get("color_ratios", True) is not False
    max_rows = int(props.get("max_rows") or _MAX_ROWS)
    columns = list(result.columns or [])
    sel = binding.get("columns")
    if isinstance(sel, list) and sel:
        columns = [c for c in columns if c in {str(x) for x in sel}]
    rows = list(result.rows or [])[:max_rows]
    if not columns:
        return "<p class='comp-empty'>（无数据）</p>"
    style = str(props.get("style") or "business")
    style_cls = f" style-{html.escape(style)}" if style in ("compact", "alert", "business") else ""
    parts = [f"<table class='comp-table{style_cls}'><thead><tr>"]
    for c in columns:
        parts.append(f"<th>{_esc(c)}</th>")
    parts.append("</tr></thead><tbody>")
    col_index = {name: i for i, name in enumerate(result.columns or [])}
    for row in rows:
        parts.append("<tr>")
        for c in columns:
            i = col_index.get(c, -1)
            cell = row[i] if 0 <= i < len(row) else ""
            cell_s = "" if cell is None else str(cell)
            cls = _ratio_class(cell_s, enabled=color_ratios)
            attr = f" class='{cls}'" if cls else ""
            parts.append(f"<td{attr}>{_esc(cell_s)}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table>")
    return "".join(parts)


def _render_table_md(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """数据表 Markdown（复用 text_md 渲染器）。"""
    from app.plugins.renderer.text_md import render_markdown_table

    binding = dict(node.get("binding") or {})
    result = _get_dataset(data_ctx, binding)
    if result is None or not result.columns:
        return ""
    props = dict(node.get("props") or {})
    max_rows = int(props.get("max_rows") or _MAX_ROWS)
    trimmed = QueryResult(
        columns=list(result.columns),
        rows=list(result.rows or [])[:max_rows],
    )
    return render_markdown_table(trimmed, title=None)


# 多系列图表调色板（打印友好、对比度足够）
_CHART_COLORS = [
    "#1677ff",
    "#52c41a",
    "#faad14",
    "#ff4d4f",
    "#722ed1",
    "#13c2c2",
    "#eb2f96",
    "#2f54eb",
    "#a0d911",
    "#fa8c16",
]


def _to_float(value: Any) -> float | None:
    """宽松数值解析：去千分位逗号与百分号；失败返回 None。"""
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    s = str(value).strip().replace(",", "").replace("%", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _chart_series(
    node: dict[str, Any], data_ctx: dict[str, QueryResult]
) -> tuple[list[str], list[float], str, list[dict[str, Any]]]:
    """从绑定列抽取图表序列。

    返回
    -------
    labels, primary_values, chart_type, multi_series
        multi_series 为 ``[{name, values}, ...]``，多 Y 列时使用。
    """
    props = dict(node.get("props") or {})
    binding = dict(node.get("binding") or {})
    result = _get_dataset(data_ctx, binding)
    chart_type = str(props.get("chart_type") or binding.get("chart_type") or "bar").lower()
    if chart_type not in ("bar", "pie", "line", "area", "hbar"):
        chart_type = "bar"

    if result is None or not result.columns or not result.rows:
        return [], [], chart_type, []

    columns = list(result.columns)
    label_col = str(binding.get("category_column") or binding.get("label_column") or "")
    value_col = str(binding.get("value_column") or "")
    value_cols_raw = binding.get("value_columns") or props.get("value_columns")
    value_cols: list[str] = []
    if isinstance(value_cols_raw, list) and value_cols_raw:
        value_cols = [str(c) for c in value_cols_raw if str(c) in columns]
    if not value_cols and value_col:
        value_cols = [value_col]

    if not label_col and columns:
        label_col = columns[0]
    if not value_cols:
        for c in columns:
            if c == label_col:
                continue
            idx = columns.index(c)
            sample = result.rows[0][idx] if result.rows and idx < len(result.rows[0]) else None
            if _to_float(sample) is not None:
                value_cols = [c]
                break
        if not value_cols and len(columns) > 1:
            value_cols = [columns[1]]
        elif not value_cols:
            value_cols = [columns[0]]

    li = columns.index(label_col) if label_col in columns else 0
    max_rows = int(props.get("max_rows") or 50)
    vis = [columns.index(c) if c in columns else -1 for c in value_cols]

    labels: list[str] = []
    series_vals: list[list[float]] = [[] for _ in value_cols]
    for row in list(result.rows)[:max_rows]:
        lab = row[li] if li < len(row) else ""
        row_ok = False
        row_nums: list[float | None] = []
        for vi in vis:
            val = _to_float(row[vi] if 0 <= vi < len(row) else None)
            row_nums.append(val)
            if val is not None:
                row_ok = True
        if not row_ok:
            continue
        labels.append("" if lab is None else str(lab))
        for si, val in enumerate(row_nums):
            series_vals[si].append(float(val) if val is not None else 0.0)

    multi = [
        {"name": value_cols[i], "values": series_vals[i]}
        for i in range(len(value_cols))
        if series_vals[i]
    ]
    primary = series_vals[0] if series_vals else []
    return labels, primary, chart_type, multi


def _render_bar_svg(labels: list[str], values: list[float], *, width: int = 680, height: int = 260) -> str:
    """柱状图 SVG 回退（ECharts 截图失败时使用）。"""
    if not values:
        return "<p class='comp-empty'>（图表无有效数值）</p>"
    max_v = max(values) or 1.0
    pad_l, pad_r, pad_t, pad_b = 40, 16, 16, 48
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b
    n = len(values)
    gap = 8
    bar_w = max(8.0, (plot_w - gap * (n + 1)) / n)
    parts = [
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>",
        f"<line x1='{pad_l}' y1='{pad_t}' x2='{pad_l}' y2='{pad_t + plot_h}' stroke='#d9d9d9' stroke-width='1'/>",
        f"<line x1='{pad_l}' y1='{pad_t + plot_h}' x2='{pad_l + plot_w}' y2='{pad_t + plot_h}' stroke='#d9d9d9' stroke-width='1'/>",
    ]
    for i, (lab, val) in enumerate(zip(labels, values, strict=False)):
        bh = (val / max_v) * plot_h if max_v else 0
        x = pad_l + gap + i * (bar_w + gap)
        y = pad_t + plot_h - bh
        color = _CHART_COLORS[i % len(_CHART_COLORS)]
        parts.append(
            f"<rect x='{x:.1f}' y='{y:.1f}' width='{bar_w:.1f}' height='{bh:.1f}' "
            f"fill='{color}' rx='3'/>"
        )
        # 柱顶数值
        parts.append(
            f"<text x='{x + bar_w / 2:.1f}' y='{y - 4:.1f}' text-anchor='middle' "
            f"font-size='11' fill='#666'>{_esc(_fmt_num(val))}</text>"
        )
        # 轴下分类标签（超长截断）
        short = lab if len(lab) <= 8 else lab[:7] + "…"
        parts.append(
            f"<text x='{x + bar_w / 2:.1f}' y='{pad_t + plot_h + 16}' text-anchor='middle' "
            f"font-size='11' fill='#666'>{_esc(short)}</text>"
        )
    parts.append("</svg>")
    return "".join(parts)


def _fmt_num(v: float) -> str:
    """整数去小数位，否则保留一位小数。"""
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    return f"{v:.1f}"


def _render_line_svg(labels: list[str], values: list[float], *, width: int = 680, height: int = 260) -> str:
    """折线图 SVG 回退。"""
    if not values:
        return "<p class='comp-empty'>（图表无有效数值）</p>"
    max_v = max(values) or 1.0
    min_v = min(0.0, min(values))
    span = max_v - min_v or 1.0
    pad_l, pad_r, pad_t, pad_b = 40, 16, 20, 48
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b
    n = len(values)
    parts = [
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>",
        f"<line x1='{pad_l}' y1='{pad_t}' x2='{pad_l}' y2='{pad_t + plot_h}' stroke='#d9d9d9'/>",
        f"<line x1='{pad_l}' y1='{pad_t + plot_h}' x2='{pad_l + plot_w}' y2='{pad_t + plot_h}' stroke='#d9d9d9'/>",
    ]
    pts: list[tuple[float, float]] = []
    for i, val in enumerate(values):
        x = pad_l + (plot_w * i / max(n - 1, 1))
        y = pad_t + plot_h - ((val - min_v) / span) * plot_h
        pts.append((x, y))
    if len(pts) >= 2:
        d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        parts.append(f"<path d='{d}' fill='none' stroke='var(--theme,#1677ff)' stroke-width='2.5'/>")
    for i, ((x, y), lab, val) in enumerate(zip(pts, labels, values, strict=False)):
        parts.append(f"<circle cx='{x:.1f}' cy='{y:.1f}' r='4' fill='var(--theme,#1677ff)'/>")
        parts.append(
            f"<text x='{x:.1f}' y='{y - 8:.1f}' text-anchor='middle' font-size='10' fill='#666'>"
            f"{_esc(_fmt_num(val))}</text>"
        )
        short = lab if len(lab) <= 8 else lab[:7] + "…"
        parts.append(
            f"<text x='{x:.1f}' y='{pad_t + plot_h + 16}' text-anchor='middle' font-size='11' fill='#666'>"
            f"{_esc(short)}</text>"
        )
    parts.append("</svg>")
    return "".join(parts)


def _render_pie_svg(labels: list[str], values: list[float], *, size: int = 220) -> str:
    """饼图 SVG 回退（含图例与占比）。"""
    if not values:
        return "<p class='comp-empty'>（图表无有效数值）</p>"
    total = sum(values)
    if total <= 0:
        return "<p class='comp-empty'>（数值合计为 0）</p>"
    cx = cy = size / 2
    r = size / 2 - 8
    parts = [
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{size}' height='{size}' viewBox='0 0 {size} {size}'>"
    ]
    angle = -math.pi / 2  # 从 12 点方向起画
    for i, val in enumerate(values):
        sweep = (val / total) * 2 * math.pi
        if sweep <= 0:
            continue
        x1 = cx + r * math.cos(angle)
        y1 = cy + r * math.sin(angle)
        angle2 = angle + sweep
        x2 = cx + r * math.cos(angle2)
        y2 = cy + r * math.sin(angle2)
        large = 1 if sweep > math.pi else 0
        color = _CHART_COLORS[i % len(_CHART_COLORS)]
        # 整圆无法用 arc 路径，特殊处理
        if abs(sweep - 2 * math.pi) < 1e-9:
            parts.append(f"<circle cx='{cx}' cy='{cy}' r='{r}' fill='{color}'/>")
        else:
            parts.append(
                f"<path d='M {cx} {cy} L {x1:.2f} {y1:.2f} "
                f"A {r} {r} 0 {large} 1 {x2:.2f} {y2:.2f} Z' fill='{color}'/>"
            )
        angle = angle2
    parts.append("</svg>")
    legend_items = []
    for i, (lab, val) in enumerate(zip(labels, values, strict=False)):
        color = _CHART_COLORS[i % len(_CHART_COLORS)]
        pct = val / total * 100
        legend_items.append(
            f"<span><i class='comp-chart-swatch' style='background:{color}'></i>"
            f"{_esc(lab)} {_esc(_fmt_num(val))} ({pct:.0f}%)</span>"
        )
    return (
        "<div class='comp-chart-wrap'>"
        + "".join(parts)
        + "</div><div class='comp-chart-legend'>"
        + "".join(legend_items)
        + "</div>"
    )


def _render_chart_html(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """图表 HTML：优先 ECharts+Playwright 出 PNG，失败则内嵌 SVG。"""
    props = dict(node.get("props") or {})
    labels, values, chart_type, multi = _chart_series(node, data_ctx)
    title = str(props.get("title") or "")
    if not values:
        return (
            f"<div class='comp-chart'><p class='comp-empty'>"
            f"（请绑定分类列与数值列，并先取数）</p></div>"
        )

    # 主路径：Apache ECharts option → Playwright 截图 → data URL 嵌入
    try:
        from app.modules.studio.charts import chart_img_html, chart_to_png_data_url

        props_full = {
            **props,
            "chart_type": chart_type,
            "value_series": multi if len(multi) > 1 else None,
            "show_legend": props.get("legend") or props.get("show_legend") or len(multi) > 1,
        }
        data_url, err = chart_to_png_data_url(labels, values, props_full)
        if data_url:
            return chart_img_html(data_url, title="")
        note = f"<p class='comp-empty' style='font-size:11px'>echarts: {_esc(err or 'fail')}</p>"
    except Exception as exc:  # noqa: BLE001
        note = f"<p class='comp-empty' style='font-size:11px'>chart engine: {_esc(str(exc))}</p>"
    else:
        note = ""

    title_html = f"<div class='comp-chart-title'>{_esc(title)}</div>" if title else ""
    if chart_type == "pie":
        body = _render_pie_svg(labels, values)
    elif chart_type in ("line", "area"):
        body = _render_line_svg(labels, values)
    else:
        body = _render_bar_svg(labels, values)
    return f"<div class='comp-chart'>{title_html}{body}{note}</div>"


def _render_chart_md(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """图表 Markdown：标题 + 键值列表（不嵌入图片）。"""
    props = dict(node.get("props") or {})
    labels, values, chart_type, multi = _chart_series(node, data_ctx)
    type_label = {
        "pie": "饼图",
        "line": "折线图",
        "bar": "柱状图",
        "area": "面积图",
        "hbar": "条形图",
    }.get(chart_type, chart_type)
    title = str(props.get("title") or type_label)
    if not values:
        return f"**{title}**（无数据）"
    lines = [f"**{title}**（{type_label}）"]
    if multi and len(multi) > 1:
        for s in multi:
            lines.append(f"- {s.get('name')}: {s.get('values')}")
    else:
        for lab, val in zip(labels, values, strict=False):
            lines.append(f"- {lab}: {_fmt_num(val)}")
    return "\n".join(lines)


def _render_alert_html(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """告警条 HTML；level 决定 info/success/warning/error 配色。"""
    props = dict(node.get("props") or {})
    binding = dict(node.get("binding") or {})
    result = _get_dataset(data_ctx, binding)
    text = substitute_first_row(str(props.get("text") or "请注意相关指标异常"), result)
    level = str(props.get("level") or "error")
    cls = "comp-alert"
    if level in ("info", "success", "warning"):
        cls = f"comp-alert {level}"
    return f"<div class='{cls}'>{_esc(text)}</div>"


def _render_alert_md(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """告警条 Markdown 引用块。"""
    props = dict(node.get("props") or {})
    binding = dict(node.get("binding") or {})
    result = _get_dataset(data_ctx, binding)
    text = substitute_first_row(str(props.get("text") or "请注意相关指标异常"), result)
    return f"> ⚠ {text}"


def _as_int(value: Any, default: int) -> int:
    """安全 int 转换，失败返回 default。"""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _has_free_layout(props: dict[str, Any]) -> bool:
    """是否使用自由画布坐标（存在 compose_x / compose_y）。"""
    return props.get("compose_x") is not None or props.get("compose_y") is not None


def _children_use_free_layout(children: list[Any]) -> bool:
    """任一子节点带自由坐标则整容器切到 freeboard。"""
    for ch in children:
        if isinstance(ch, dict) and _has_free_layout(dict(ch.get("props") or {})):
            return True
    return False


def _free_board_height(children: list[Any], canvas_width: int = 750) -> int:
    """按子节点 y+h 估算自由画布最小高度，避免裁切。"""
    bottom = 200
    for i, ch in enumerate(children):
        if not isinstance(ch, dict):
            continue
        props = dict(ch.get("props") or {})
        if not _has_free_layout(props):
            continue
        y = _as_int(props.get("compose_y"), 12 + i * 220)
        h = _as_int(props.get("compose_h"), 200)
        if h <= 0:
            h = 200
        bottom = max(bottom, y + h + 16)
    return bottom


def _wrap_compose_layout(node: dict[str, Any], inner: str, *, canvas_width: int = 750) -> str:
    """装配层布局包装：自由绝对定位（x/y/w/h+样式）或旧版宽度百分比。"""
    if not inner:
        return ""
    props = dict(node.get("props") or {})
    color = props.get("compose_color")

    if _has_free_layout(props):
        x = max(0, _as_int(props.get("compose_x"), 12))
        y = max(0, _as_int(props.get("compose_y"), 12))
        w = _as_int(props.get("compose_w"), 0)
        if w <= 0:
            pct = _as_int(props.get("compose_width"), 100)
            w = max(120, int(canvas_width * max(10, min(100, pct)) / 100) - 24)
        h = max(40, _as_int(props.get("compose_h"), 200))
        preset = str(props.get("compose_style") or "card")
        if preset not in ("card", "plain", "border", "shadow"):
            preset = "card"
        radius = _as_int(props.get("compose_radius"), 8)
        padding = max(0, _as_int(props.get("compose_padding"), 0))
        try:
            opacity = float(props.get("compose_opacity") if props.get("compose_opacity") is not None else 1)
        except (TypeError, ValueError):
            opacity = 1.0
        opacity = max(0.05, min(1.0, opacity))
        bg = props.get("compose_bg")
        outer: list[str] = [
            f"left:{x}px",
            f"top:{y}px",
            f"width:{w}px",
            f"height:{h}px",
            f"opacity:{opacity}",
            f"border-radius:{radius}px",
        ]
        if bg:
            outer.append(f"background:{html.escape(str(bg))}")
        if color:
            outer.append(f"--theme:{html.escape(str(color))}")
            if preset in ("card", "border"):
                outer.append(f"border-color:{html.escape(str(color))}")
        inner_style = f"padding:{padding}px" if padding else ""
        return (
            f"<div class='comp-free {html.escape(preset)}' style='{';'.join(outer)}'>"
            f"<div class='comp-free-inner' style='{inner_style}'>{inner}</div>"
            f"</div>"
        )

    # 旧版：宽度百分比 + 可选主题色强调
    styles: list[str] = []
    w = _as_int(props.get("compose_width"), 100)
    if w != 100:
        styles.append(
            f"width:{max(10, min(100, w))}%;display:inline-block;"
            "vertical-align:top;box-sizing:border-box;padding:0 4px"
        )
    if color:
        styles.append(f"--theme:{html.escape(str(color))}")
    if not styles:
        return inner
    return f"<div style='{';'.join(styles)}'>{inner}</div>"


def _walk_html(
    node: dict[str, Any],
    data_ctx: dict[str, QueryResult],
    *,
    canvas_width: int = 750,
) -> str:
    """递归遍历组件树生成 HTML 片段（含可见性与装配布局）。"""
    if not _visible(node, data_ctx):
        return ""
    ntype = str(node.get("type") or "")
    if ntype == "Container":
        props = dict(node.get("props") or {})
        children = [ch for ch in (node.get("children") or []) if isinstance(ch, dict)]
        kids = [_walk_html(ch, data_ctx, canvas_width=canvas_width) for ch in children]
        inner = "".join(k for k in kids if k)
        if _children_use_free_layout(children):
            height = _free_board_height(children, canvas_width)
            return (
                f"<div class='comp-freeboard' style='min-height:{height}px'>{inner}</div>"
            )
        direction = str(props.get("direction") or "column")
        gap = int(props.get("gap") or (12 if direction == "column" else 8))
        cls = "comp-vstack" if direction == "column" else "comp-hstack"
        return _wrap_compose_layout(
            node,
            f"<div class='{cls}' style='--gap:{gap}px'>{inner}</div>",
            canvas_width=canvas_width,
        )
    body = ""
    if ntype == "Text":
        body = _render_text_html(node, data_ctx)
    elif ntype == "Kpi":
        body = _render_kpi_html(node, data_ctx)
    elif ntype == "Table":
        body = _render_table_html(node, data_ctx)
    elif ntype == "Chart":
        body = _render_chart_html(node, data_ctx)
    elif ntype == "Alert":
        body = _render_alert_html(node, data_ctx)
    elif ntype == "Divider":
        body = "<hr style='border:none;border-top:1px solid #e5e5e5;margin:4px 0'/>"
    else:
        return ""
    return _wrap_compose_layout(node, body, canvas_width=canvas_width)


def _walk_md(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> list[str]:
    """递归遍历组件树，收集 Markdown 段落列表。"""
    if not _visible(node, data_ctx):
        return []
    ntype = str(node.get("type") or "")
    if ntype == "Container":
        out: list[str] = []
        for ch in node.get("children") or []:
            if isinstance(ch, dict):
                out.extend(_walk_md(ch, data_ctx))
        return out
    if ntype == "Text":
        t = _render_text_md(node, data_ctx)
        return [t] if t else []
    if ntype == "Kpi":
        return [_render_kpi_md(node, data_ctx)]
    if ntype == "Table":
        t = _render_table_md(node, data_ctx)
        return [t] if t else []
    if ntype == "Chart":
        t = _render_chart_md(node, data_ctx)
        return [t] if t else []
    if ntype == "Alert":
        t = _render_alert_md(node, data_ctx)
        return [t] if t else []
    return []


def list_canvases(doc: dict[str, Any]) -> list[dict[str, Any]]:
    """列出画布；兼容仅有 ``tree`` 的旧文档（升为单画布）。"""
    raw = doc.get("canvases")
    if isinstance(raw, list) and raw:
        out: list[dict[str, Any]] = []
        for i, c in enumerate(raw):
            if not isinstance(c, dict):
                continue
            out.append(
                {
                    **c,
                    "id": str(c.get("id") or f"canvas_{i}"),
                    "name": str(c.get("name") or f"画布 {i + 1}"),
                    "tree": c.get("tree")
                    if isinstance(c.get("tree"), dict)
                    else {"type": "Container", "children": []},
                }
            )
        if out:
            return out
    tree = doc.get("tree") or {"type": "Container", "children": []}
    ab = dict(doc.get("artboard") or {})
    return [
        {
            "id": "canvas_main",
            "name": "画布 1",
            "width": ab.get("width") or 750,
            "show_chrome": ab.get("show_chrome"),
            "chrome_title": ab.get("chrome_title"),
            "theme": ab.get("theme"),
            "tree": tree if isinstance(tree, dict) else {"type": "Container", "children": []},
        }
    ]


def canvas_to_doc(parent: dict[str, Any], canvas: dict[str, Any]) -> dict[str, Any]:
    """将单个画布提升为可独立编译的 artboard 文档。"""
    ab = dict(parent.get("artboard") or {})
    theme = canvas.get("theme") if isinstance(canvas.get("theme"), dict) else ab.get("theme")
    ab = {
        **ab,
        "width": canvas.get("width") or ab.get("width") or 750,
        "show_chrome": canvas.get("show_chrome")
        if canvas.get("show_chrome") is not None
        else ab.get("show_chrome"),
        "chrome_title": canvas.get("chrome_title") or ab.get("chrome_title"),
        "theme": theme,
    }
    tree = canvas.get("tree") if isinstance(canvas.get("tree"), dict) else {
        "type": "Container",
        "children": [],
    }
    return {
        **{k: v for k, v in parent.items() if k not in ("tree", "canvases", "artboard", "compose")},
        "artboard": ab,
        "tree": tree,
        "canvases": [canvas],
    }


def _render_one_canvas_block(
    canvas: dict[str, Any],
    data_ctx: dict[str, QueryResult],
    *,
    default_width: int = 750,
) -> tuple[str, int]:
    """渲染单个画布的 chrome+body HTML 片段，返回 (html, width)。"""
    ab = {
        "width": canvas.get("width") or default_width,
        "show_chrome": canvas.get("show_chrome"),
        "chrome_title": canvas.get("chrome_title") or "数据推送",
        "theme": canvas.get("theme") if isinstance(canvas.get("theme"), dict) else {},
    }
    pack = resolve_theme(ab)
    width = int(ab.get("width") or default_width)
    tree = canvas.get("tree") if isinstance(canvas.get("tree"), dict) else {
        "type": "Container",
        "children": [],
    }
    body = _walk_html(tree, data_ctx, canvas_width=width)
    free = _children_use_free_layout(
        [ch for ch in (tree.get("children") or []) if isinstance(ch, dict)]
    )
    body_cls = "artboard-body free" if free else "artboard-body"
    chrome_title = str(ab.get("chrome_title") or "数据推送")
    main = data_ctx.get("main") or (next(iter(data_ctx.values())) if data_ctx else None)
    if main:
        chrome_title = substitute_first_row(chrome_title, main)
    bar_cls = "artboard-chrome alert" if pack.get("bar_class") == "alert" else "artboard-chrome"
    show_chrome = ab.get("show_chrome", True) is not False
    chrome_html = (
        f"<div class='{bar_cls}'>{_esc(chrome_title)}</div>" if show_chrome else ""
    )
    # 主题色写到本块，多画布可各自主题
    block = (
        f"<div class='artboard-panel' style='width:{width}px;"
        f"{theme_css_vars(pack)}'>"
        f"{chrome_html}<div class='{body_cls}'>{body}</div></div>"
    )
    return block, width


def ordered_canvases_for_push(
    doc: dict[str, Any],
) -> list[dict[str, Any]]:
    """推送用画布顺序：优先 compose.segments 中的 canvas，否则全部画布。"""
    canvases = list_canvases(doc)
    by_id = {str(c.get("id")): c for c in canvases}
    compose = dict(doc.get("compose") or {})
    segs = _compose_segments(compose, canvases)
    ordered: list[dict[str, Any]] = []
    seen: set[str] = set()
    for s in segs:
        if str(s.get("type")) != "canvas":
            continue
        cid = str(s.get("canvas_id") or "")
        c = by_id.get(cid)
        if c and cid not in seen:
            ordered.append(c)
            seen.add(cid)
    return ordered or canvases


def build_artboard_html(doc: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """组装完整 HTML 文档：主题 CSS + 画布 body。

    输出含 ``id='artboard'`` 根节点，供 Playwright 精确截图。
    **多画布纵向合成一张图**（一条推送 = 一张成图），顺序见
    :func:`ordered_canvases_for_push`。
    """
    panels = ordered_canvases_for_push(doc)
    if not panels:
        panels = list_canvases(doc)
    default_w = int((doc.get("artboard") or {}).get("width") or 750)
    blocks: list[str] = []
    max_w = default_w
    # 外层用第一画布主题做 :root
    first_ab = {
        "width": panels[0].get("width") if panels else default_w,
        "theme": (panels[0].get("theme") if panels else None)
        or (doc.get("artboard") or {}).get("theme"),
    }
    pack = resolve_theme(first_ab)
    for c in panels:
        block, w = _render_one_canvas_block(c, data_ctx, default_width=default_w)
        blocks.append(block)
        max_w = max(max_w, w)
    stack_css = (
        ".artboard-stack{display:flex;flex-direction:column;gap:16px;align-items:stretch;}"
        ".artboard-panel{background:#fff;}"
    )
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<style>{_CSS}\n{stack_css}\n:root {{ {theme_css_vars(pack)} --ab-width: {max_w}px; }}</style>"
        "</head><body>"
        f"<div class='artboard' id='artboard' style='width:{max_w}px'>"
        f"<div class='artboard-stack'>{''.join(blocks)}</div></div>"
        "</body></html>"
    )


def build_artboard_markdown(doc: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    """组件树 → 单一 Markdown 字符串（段落间空行分隔）。

    多画布时拼接各画布 Markdown。
    """
    canvases = list_canvases(doc)
    chunks: list[str] = []
    for c in canvases:
        tree = c.get("tree") or {}
        parts = _walk_md(tree if isinstance(tree, dict) else {}, data_ctx)
        md = "\n\n".join(p for p in parts if p)
        if md:
            chunks.append(md)
    if chunks:
        return "\n\n".join(chunks)
    tree = doc.get("tree") or {}
    parts = _walk_md(tree if isinstance(tree, dict) else {}, data_ctx)
    return "\n\n".join(p for p in parts if p)


def _html_to_png(html_doc: str, width: int = 750) -> tuple[bytes | None, str | None]:
    """将画板 HTML 截为 PNG，经 LocalStorage 落盘。

    后端优先级：Playwright Chromium → wkhtmltoimage → 失败返回 (None, None)。
    """
    import os
    import subprocess
    import tempfile
    from pathlib import Path

    from app.storage.local import LocalStorage

    png: bytes | None = None
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "artboard.png"
        # Playwright
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": width + 40, "height": 900})
                page.set_content(html_doc, wait_until="networkidle")
                page.locator("#artboard").screenshot(path=str(out))
                browser.close()
            if out.is_file() and out.stat().st_size > 0:
                png = out.read_bytes()
        except Exception:
            png = None

        if png is None:
            binary = os.environ.get("WKHTMLTOIMAGE") or "wkhtmltoimage"
            html_path = Path(tmp) / "a.html"
            html_path.write_text(html_doc, encoding="utf-8")
            try:
                proc = subprocess.run(
                    [
                        binary,
                        "--quality",
                        "90",
                        "--width",
                        str(width + 40),
                        "--enable-local-file-access",
                        str(html_path),
                        str(out),
                    ],
                    capture_output=True,
                    timeout=60,
                )
                if proc.returncode == 0 and out.is_file() and out.stat().st_size > 0:
                    png = out.read_bytes()
            except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
                png = None

        if png is None:
            # Minimal PNG via Pillow using markdown-ish text is poor;
            # fallback: re-use table template if possible
            return None, None

        path = LocalStorage().save_bytes(png, "artboard.png")
        return png, path


def _main_query_result(data_ctx: dict[str, QueryResult]) -> QueryResult | None:
    """取主数据集；无 main 键时回退 data_ctx 第一个。"""
    if "main" in data_ctx:
        return data_ctx["main"]
    if data_ctx:
        return next(iter(data_ctx.values()))
    return None


def _resolve_compose_text(template: Any, data_ctx: dict[str, QueryResult]) -> str:
    """解析推送外壳富文本/Markdown，并做首行 ``{{字段}}`` 替换。

    编辑器存 Quill HTML；出站钉钉文本会转为钉钉友好 Markdown（加粗/标题/列表/字体色）。
    """
    from app.modules.studio.html_md import is_empty_rich_text, rich_to_push_text

    raw = str(template or "")
    if not raw.strip() or is_empty_rich_text(raw):
        return ""
    # 先替换字段，再 HTML→Markdown，避免标签打断占位符
    resolved = substitute_first_row(raw, _main_query_result(data_ctx))
    return rich_to_push_text(resolved)


def _compose_include_component_md(compose: dict[str, Any], *, has_shell_text: bool) -> bool:
    """是否附加组件树自动生成的 Markdown。

    显式 ``include_component_md`` 优先；否则兼容旧逻辑：
    仅在无用户外壳文案时按 ``markdown_caption``（默认 True）附加。
    """
    if "include_component_md" in compose:
        return bool(compose.get("include_component_md"))
    if has_shell_text:
        return False
    return compose.get("markdown_caption", True) is not False


def _compose_segments(compose: dict[str, Any], canvases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """解析 compose.segments；缺失时由 text_before/after + 全画布生成默认顺序。"""
    raw = compose.get("segments")
    if isinstance(raw, list) and raw:
        ids = {str(c.get("id")) for c in canvases}
        out: list[dict[str, Any]] = []
        for s in raw:
            if not isinstance(s, dict):
                continue
            st = str(s.get("type") or "")
            if st == "text":
                out.append(s)
            elif st == "canvas" and str(s.get("canvas_id") or "") in ids:
                out.append(s)
        if out:
            return out
    # 默认：图前文案 → 各画布 → 图后文案
    segs: list[dict[str, Any]] = [
        {"id": "seg_before", "type": "text", "html": compose.get("text_before") or ""},
    ]
    for c in canvases:
        segs.append({"id": f"seg_{c.get('id')}", "type": "canvas", "canvas_id": c.get("id")})
    segs.append({"id": "seg_after", "type": "text", "html": compose.get("text_after") or ""})
    return segs


def artboard_to_message(
    doc: dict[str, Any],
    data_ctx: dict[str, QueryResult],
    *,
    with_image: bool = True,
) -> Message:
    """画板 + 推送外壳 → 出站 :class:`Message`。

    **产品约束：一次推送 = 钉钉上一条消息语义。**

    - 多画布 **纵向合成一张 PNG**（不再按画布拆成多条 image）
    - 全部文案段合并为 **一段** 钉钉 Markdown
    - 出站 parts 最多为 ``[text?, image?]``，避免群里刷出 N 条机器人消息

    compose 字段（``doc.compose``）::

        mode: image_primary | markdown_primary | mixed | image_only
        segments: 编辑顺序（文案/画布）；成图时画布按出现顺序堆叠
        text_before / text_after: 兼容旧单画布
        title: 钉钉 markdown.title / 通知标题
        include_component_md / markdown_caption: 是否附带组件树 MD

    成图失败时按 mode 降级为纯文本，保证渠道仍可收到内容。
    """
    md_auto = build_artboard_markdown(doc, data_ctx)
    compose = dict(doc.get("compose") or {})
    mode = str(compose.get("mode") or "image_primary")
    canvases = list_canvases(doc)
    segments = _compose_segments(compose, canvases)

    # 全部文案段 → 一段 Markdown（钉钉 sampleMarkdown 一条消息）
    text_chunks = [
        _resolve_compose_text(s.get("html"), data_ctx)
        for s in segments
        if str(s.get("type")) == "text"
    ]
    shell_md = "\n\n".join(t for t in text_chunks if t)
    has_shell = bool(shell_md)
    if not has_shell:
        # 兼容旧字段
        legacy = "\n\n".join(
            x
            for x in (
                _resolve_compose_text(compose.get("text_before"), data_ctx),
                _resolve_compose_text(compose.get("text_after"), data_ctx),
            )
            if x
        )
        shell_md = legacy
        has_shell = bool(shell_md)

    include_auto = _compose_include_component_md(compose, has_shell_text=has_shell)
    auto_md = md_auto if include_auto else ""
    title = _resolve_compose_text(compose.get("title"), data_ctx)
    if not title:
        title = (shell_md or auto_md or md_auto or "数据推送").split("\n")[0][:80]

    parts: list[MessagePart] = []

    def _append_text(content: str) -> None:
        if content:
            parts.append(MessagePart(kind="text", content=content))

    def _append_combined_image() -> bool:
        """多画布合成一张图，只产生一个 image part。"""
        html_doc = build_artboard_html(doc, data_ctx)
        width = int((doc.get("artboard") or {}).get("width") or 750)
        # 取堆叠后最大宽
        for c in ordered_canvases_for_push(doc):
            width = max(width, int(c.get("width") or width))
        _png, path = _html_to_png(html_doc, width=width)
        if path:
            parts.append(
                MessagePart(kind="image", content={"path": path, "title": title})
            )
            return True
        return False

    if mode == "markdown_primary":
        body = "\n\n".join(x for x in (shell_md, auto_md or md_auto) if x)
        parts.append(MessagePart(kind="text", content=body or "（空内容）"))
        return Message(parts=parts)

    if mode == "image_only":
        if with_image and _append_combined_image():
            return Message(parts=parts)
        parts.append(MessagePart(kind="text", content="（成图失败）"))
        return Message(parts=parts)

    # image_primary / mixed：一条文案 + 一张合成图
    md_body = shell_md
    if auto_md and (mode == "mixed" or include_auto):
        md_body = "\n\n".join(x for x in (md_body, auto_md) if x)
    _append_text(md_body)

    image_added = False
    if with_image:
        image_added = _append_combined_image()

    if not image_added and not md_body:
        parts.append(
            MessagePart(kind="text", content=md_auto or "（成图失败，仅文本）")
        )
    elif not parts:
        parts.append(MessagePart(kind="text", content="（空内容）"))

    return Message(parts=parts)


def compile_artboard(
    doc: dict[str, Any],
    data_ctx: dict[str, QueryResult],
    *,
    want_image: bool = True,
) -> CompileResult:
    """完整编译：HTML + Markdown + Message +（可选）PNG 预览。

    工作台 ``POST /editor/studio/compile`` 与定时推送预览均走此入口。
    ``want_image=False`` 可跳过截图以加速纯 HTML/MD 预览。
    """
    html_doc = build_artboard_html(doc, data_ctx)
    md = build_artboard_markdown(doc, data_ctx)
    main = data_ctx.get("main") or (next(iter(data_ctx.values())) if data_ctx else None)
    row_count = len(main.rows) if main else 0

    image_b64 = None
    image_path = None
    image_error: str | None = None
    message = artboard_to_message(doc, data_ctx, with_image=want_image)

    if want_image:
        compose = dict(doc.get("compose") or {})
        mode = str(compose.get("mode") or "image_primary")
        if mode != "markdown_primary":
            width = int((doc.get("artboard") or {}).get("width") or 750)
            png, path = _html_to_png(html_doc, width=width)
            if png:
                image_b64 = f"data:image/png;base64,{base64.b64encode(png).decode('ascii')}"
                image_path = path
            else:
                image_error = (
                    "未能生成 PNG 预览。请安装：pip install playwright && playwright install chromium"
                    "（或配置 wkhtmltoimage）。下方仍提供 HTML 预览。"
                )

    previews = []
    for p in message.parts:
        content = p.content
        if isinstance(content, dict):
            preview = str(content.get("path") or content.get("title") or content)[:500]
        else:
            preview = str(content)[:500]
        previews.append({"kind": p.kind, "content_preview": preview})

    return CompileResult(
        html=html_doc,
        markdown=md,
        message=message,
        image_base64=image_b64,
        image_path=image_path,
        row_count=row_count,
        parts_preview=previews,
        image_error=image_error,
    )
