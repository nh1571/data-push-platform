"""推送图片用 HTML+CSS 表格渲染（兼容旧 pythonProject4 样式）。

管线：QueryResult + design → HTML(CSS) → PNG。

截图后端（先成功者胜）::

1. Playwright Chromium
2. PATH / ``WKHTMLTOIMAGE`` 环境变量中的 wkhtmltoimage
3. 回退：Pillow 模板
"""

from __future__ import annotations

import html
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from app.modules.editor.design import substitute_first_row
from app.modules.editor.templates import render_template_png
from app.plugins.base import QueryResult
from app.storage.local import LocalStorage

_MAX_ROWS = 50
_PERCENT_RE = re.compile(r"^\s*([+-]?\d+(?:\.\d+)?)\s*%\s*$")

_CSS = """
:root { --theme: #1677ff; --fg: #1f1f1f; --muted: #666; --border: #e5e5e5; --header-bg: #f5f7fa; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--fg);
  background: #fff;
}
.card { width: 720px; background: #fff; }
.bar {
  background: var(--theme);
  color: #fff;
  padding: 14px 18px;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.bar.alert { background: #ff4d4f; }
.body { padding: 16px 18px 18px; }
.subtitle { color: var(--muted); font-size: 13px; margin: 0 0 12px; line-height: 1.5; white-space: pre-wrap; }
.footer { color: var(--muted); font-size: 12px; margin-top: 14px; }
table.data {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
table.data th, table.data td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  max-width: 180px;
  word-break: break-word;
}
table.data th {
  background: var(--header-bg);
  font-weight: 600;
}
table.data tr:nth-child(even) td { background: #fafbfc; }
.r-pos-strong { color: #005737; font-weight: 600; }
.r-pos { color: #00B050; font-weight: 600; }
.r-neg { color: #FF0000; font-weight: 600; }
.r-neg-strong { color: #900000; font-weight: 600; }
.kpi-row { display: flex; gap: 12px; margin-bottom: 14px; }
.kpi {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  background: #fafcff;
}
.kpi .label { color: var(--muted); font-size: 12px; }
.kpi .value { color: var(--theme); font-size: 28px; font-weight: 700; margin-top: 6px; }
"""


def _esc(value: Any) -> str:
    """HTML 转义。"""
    if value is None:
        return ""
    return html.escape(str(value))


def _ratio_class(cell: str, *, enabled: bool) -> str:
    """百分比单元格 CSS 类（±20% 强弱）。"""
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


def build_report_html(result: QueryResult, design: dict[str, Any] | None) -> str:
    """构建可截图的完整 HTML 文档。"""
    design = dict(design or {})
    template_id = str(design.get("template_id") or "report_v1")
    theme = str(design.get("theme_color") or "#1677ff")
    if template_id == "alert_v1" and not design.get("theme_color"):
        theme = "#ff4d4f"

    title = design.get("title") or design.get("header_text") or (
        "告警" if template_id == "alert_v1" else "数据报告"
    )
    title = substitute_first_row(str(title), result)
    header_text = ""
    if design.get("title") and design.get("header_text"):
        header_text = substitute_first_row(str(design.get("header_text")), result)
    elif design.get("header_text") and str(design.get("header_text")) != str(design.get("title") or ""):
        # title 已来自 header_text
        if design.get("title"):
            header_text = substitute_first_row(str(design.get("header_text")), result)
    footer_text = (
        substitute_first_row(str(design.get("footer_text")), result)
        if design.get("footer_text")
        else ""
    )
    show_table = design.get("show_table", True)
    if show_table is None:
        show_table = True
    color_ratios = design.get("color_ratios", True)
    if color_ratios is None:
        color_ratios = True

    columns = list(result.columns or [])
    rows = list(result.rows or [])[:_MAX_ROWS]

    parts: list[str] = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'>",
        f"<style>{_CSS}\n:root {{ --theme: {html.escape(theme)}; }}</style>",
        "</head><body><div class='card'>",
        f"<div class='bar{' alert' if template_id == 'alert_v1' else ''}'>{_esc(title)}</div>",
        "<div class='body'>",
    ]

    if template_id == "kpi_v1" and rows:
        cols = columns
        kpi_cols = design.get("kpi_columns")
        if isinstance(kpi_cols, list) and kpi_cols:
            selected = [str(c) for c in kpi_cols if str(c) in cols][:3]
        else:
            selected = cols[:3]
        first = list(rows[0]) if rows else []
        idx = {name: i for i, name in enumerate(cols)}
        parts.append("<div class='kpi-row'>")
        for col_name in selected or ["—"]:
            i = idx.get(col_name)
            val = first[i] if i is not None and i < len(first) else "—"
            parts.append(
                f"<div class='kpi'><div class='label'>{_esc(col_name)}</div>"
                f"<div class='value'>{_esc(val)}</div></div>"
            )
        parts.append("</div>")

    if header_text and header_text != title:
        parts.append(f"<p class='subtitle'>{_esc(header_text)}</p>")

    if show_table and columns:
        parts.append("<table class='data'><thead><tr>")
        for c in columns:
            parts.append(f"<th>{_esc(c)}</th>")
        parts.append("</tr></thead><tbody>")
        for row in rows:
            parts.append("<tr>")
            for i, c in enumerate(columns):
                cell = row[i] if i < len(row) else ""
                cell_s = "" if cell is None else str(cell)
                cls = _ratio_class(cell_s, enabled=bool(color_ratios))
                attr = f" class='{cls}'" if cls else ""
                parts.append(f"<td{attr}>{_esc(cell_s)}</td>")
            parts.append("</tr>")
        parts.append("</tbody></table>")
    elif not rows:
        parts.append("<p class='subtitle'>（无数据）</p>")

    if footer_text:
        parts.append(f"<div class='footer'>{_esc(footer_text)}</div>")

    parts.append("</div></div></body></html>")
    return "".join(parts)


def _screenshot_playwright(html: str, out_path: Path) -> bool:
    """Playwright 截取 .card 节点为 PNG。"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 760, "height": 900})
            page.set_content(html, wait_until="networkidle")
            # 裁剪到卡片宽度
            page.locator(".card").screenshot(path=str(out_path))
            browser.close()
        return out_path.is_file() and out_path.stat().st_size > 0
    except Exception:
        return False


def _screenshot_wkhtml(html: str, out_path: Path) -> bool:
    """wkhtmltoimage 将 HTML 转为 PNG。"""
    binary = os.environ.get("WKHTMLTOIMAGE") or "wkhtmltoimage"
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as fh:
        fh.write(html)
        html_path = fh.name
    try:
        cmd = [
            binary,
            "--quality",
            "90",
            "--width",
            "760",
            "--enable-local-file-access",
            html_path,
            str(out_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, timeout=60)
        return proc.returncode == 0 and out_path.is_file() and out_path.stat().st_size > 0
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return False
    finally:
        try:
            os.unlink(html_path)
        except OSError:
            pass


def render_html_png(result: QueryResult, design: dict[str, Any] | None) -> bytes:
    """HTML+CSS 截图渲染；失败则回退 Pillow 模板。"""
    design = dict(design or {})
    engine = str(design.get("render_engine") or "auto").lower()

    if engine == "pillow":
        return render_template_png(result, design)

    html_doc = build_report_html(result, design)
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "out.png"
        ok = False
        if engine in ("auto", "html", "playwright"):
            ok = _screenshot_playwright(html_doc, out)
        if not ok and engine in ("auto", "html", "wkhtml"):
            ok = _screenshot_wkhtml(html_doc, out)
        if ok:
            return out.read_bytes()

    # 回退：Pillow 模板（始终可用）
    return render_template_png(result, design)


def render_and_save_html(
    result: QueryResult,
    design: dict[str, Any] | None,
    *,
    filename: str = "push_html.png",
) -> tuple[bytes, str]:
    """渲染 HTML/CSS（或 Pillow 回退）并经 LocalStorage 落盘。"""
    png = render_html_png(result, design)
    path = LocalStorage().save_bytes(png, filename)
    return png, path
