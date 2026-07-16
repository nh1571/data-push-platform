"""Compile artboard component tree → HTML / Markdown / PNG / Message."""

from __future__ import annotations

import base64
import html
import re
from dataclasses import dataclass, field
from typing import Any

from app.plugins.base import Message, MessagePart, QueryResult

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")
_PERCENT_RE = re.compile(r"^\s*([+-]?\d+(?:\.\d+)?)\s*%\s*$")
_MAX_ROWS = 50

_CSS = """
:root { --theme: #1677ff; --fg: #1f1f1f; --muted: #666; --border: #e5e5e5; --header-bg: #f5f7fa; }
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
  padding: 16px 18px 20px;
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
.comp-vstack { display: flex; flex-direction: column; gap: var(--gap, 12px); }
.comp-hstack { display: flex; flex-direction: row; gap: var(--gap, 8px); align-items: stretch; }
.comp-kpi {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  background: #fafcff;
  min-width: 0;
}
.comp-kpi .label { color: var(--muted); font-size: 12px; }
.comp-kpi .value { color: var(--theme); font-size: 26px; font-weight: 700; margin-top: 6px; word-break: break-all; }
table.comp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
table.comp-table th, table.comp-table td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  max-width: 180px;
  word-break: break-word;
}
table.comp-table th { background: var(--header-bg); font-weight: 600; }
table.comp-table tr:nth-child(even) td { background: #fafbfc; }
.r-pos-strong { color: #005737; font-weight: 600; }
.r-pos { color: #00B050; font-weight: 600; }
.r-neg { color: #FF0000; font-weight: 600; }
.r-neg-strong { color: #900000; font-weight: 600; }
.comp-empty { color: var(--muted); font-size: 13px; }
"""


def _esc(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value))


def _ratio_class(cell: str, *, enabled: bool) -> str:
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
    html: str
    markdown: str
    message: Message
    image_base64: str | None = None
    image_path: str | None = None
    row_count: int = 0
    parts_preview: list[dict[str, str]] = field(default_factory=list)


def _get_dataset(
    data_ctx: dict[str, QueryResult],
    binding: dict[str, Any] | None,
    default_id: str = "main",
) -> QueryResult | None:
    binding = binding or {}
    ds_id = str(binding.get("dataset_id") or default_id)
    if ds_id in data_ctx:
        return data_ctx[ds_id]
    if data_ctx:
        return next(iter(data_ctx.values()))
    return None


def _visible(node: dict[str, Any]) -> bool:
    return node.get("visible", True) is not False


def _render_text_html(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    props = dict(node.get("props") or {})
    binding = dict(node.get("binding") or {})
    result = _get_dataset(data_ctx, binding)
    text = substitute_first_row(str(props.get("text") or ""), result)
    variant = str(props.get("variant") or "body")
    cls = {
        "h1": "comp-text-h1",
        "title": "comp-text-h1",
        "body": "comp-text-body",
        "caption": "comp-text-caption",
        "footer": "comp-text-caption",
    }.get(variant, "comp-text-body")
    tag = "h1" if cls == "comp-text-h1" else "p"
    return f"<{tag} class='{cls}'>{_esc(text)}</{tag}>"


def _render_text_md(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    props = dict(node.get("props") or {})
    binding = dict(node.get("binding") or {})
    result = _get_dataset(data_ctx, binding)
    text = substitute_first_row(str(props.get("text") or ""), result)
    variant = str(props.get("variant") or "body")
    if variant in ("h1", "title"):
        return f"## {text}" if text else ""
    return text


def _resolve_kpi(
    node: dict[str, Any], data_ctx: dict[str, QueryResult]
) -> tuple[str, str]:
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
    label, value = _resolve_kpi(node, data_ctx)
    return (
        f"<div class='comp-kpi'><div class='label'>{_esc(label)}</div>"
        f"<div class='value'>{_esc(value)}</div></div>"
    )


def _render_kpi_md(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    label, value = _resolve_kpi(node, data_ctx)
    return f"**{label}**: {value}"


def _render_table_html(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
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
    parts = ["<table class='comp-table'><thead><tr>"]
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


def _walk_html(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    if not _visible(node):
        return ""
    ntype = str(node.get("type") or "")
    if ntype == "Container":
        props = dict(node.get("props") or {})
        direction = str(props.get("direction") or "column")
        gap = int(props.get("gap") or (12 if direction == "column" else 8))
        cls = "comp-vstack" if direction == "column" else "comp-hstack"
        kids = [
            _walk_html(ch, data_ctx)
            for ch in (node.get("children") or [])
            if isinstance(ch, dict)
        ]
        inner = "".join(k for k in kids if k)
        return f"<div class='{cls}' style='--gap:{gap}px'>{inner}</div>"
    if ntype == "Text":
        return _render_text_html(node, data_ctx)
    if ntype == "Kpi":
        return _render_kpi_html(node, data_ctx)
    if ntype == "Table":
        return _render_table_html(node, data_ctx)
    if ntype == "Divider":
        return "<hr style='border:none;border-top:1px solid #e5e5e5;margin:4px 0'/>"
    return ""


def _walk_md(node: dict[str, Any], data_ctx: dict[str, QueryResult]) -> list[str]:
    if not _visible(node):
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
    return []


def build_artboard_html(doc: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    ab = dict(doc.get("artboard") or {})
    theme = dict(ab.get("theme") or {})
    color = str(theme.get("color") or "#1677ff")
    width = int(ab.get("width") or 750)
    tree = doc.get("tree") or {"type": "Container", "children": []}
    body = _walk_html(tree if isinstance(tree, dict) else {}, data_ctx)
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<style>{_CSS}\n:root {{ --theme: {html.escape(color)}; "
        f"--ab-width: {width}px; }}</style>"
        "</head><body>"
        f"<div class='artboard' id='artboard'>{body}</div>"
        "</body></html>"
    )


def build_artboard_markdown(doc: dict[str, Any], data_ctx: dict[str, QueryResult]) -> str:
    tree = doc.get("tree") or {}
    parts = _walk_md(tree if isinstance(tree, dict) else {}, data_ctx)
    return "\n\n".join(p for p in parts if p)


def _html_to_png(html_doc: str, width: int = 750) -> tuple[bytes | None, str | None]:
    """Screenshot artboard HTML; return (png_bytes, path) with path via LocalStorage."""
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


def artboard_to_message(
    doc: dict[str, Any],
    data_ctx: dict[str, QueryResult],
    *,
    with_image: bool = True,
) -> Message:
    """Build Message from artboard + data context."""
    md = build_artboard_markdown(doc, data_ctx)
    compose = dict(doc.get("compose") or {})
    mode = str(compose.get("mode") or "image_primary")
    caption = compose.get("markdown_caption", True) is not False
    parts: list[MessagePart] = []

    if mode == "markdown_primary":
        parts.append(MessagePart(kind="text", content=md or "（空内容）"))
        return Message(parts=parts)

    if with_image:
        html_doc = build_artboard_html(doc, data_ctx)
        width = int((doc.get("artboard") or {}).get("width") or 750)
        png, path = _html_to_png(html_doc, width=width)
        if path:
            title = md.split("\n")[0][:80] if md else "数据推送"
            parts.append(
                MessagePart(kind="image", content={"path": path, "title": title})
            )
        elif mode != "mixed":
            # no image engine — fall back to markdown
            parts.append(MessagePart(kind="text", content=md or "（成图失败，仅文本）"))
            return Message(parts=parts)

    if mode == "mixed" or caption or not parts:
        if md:
            parts.append(MessagePart(kind="text", content=md))
        elif not parts:
            parts.append(MessagePart(kind="text", content="（空内容）"))

    return Message(parts=parts)


def compile_artboard(
    doc: dict[str, Any],
    data_ctx: dict[str, QueryResult],
    *,
    want_image: bool = True,
) -> CompileResult:
    """Full compile for preview APIs."""
    html_doc = build_artboard_html(doc, data_ctx)
    md = build_artboard_markdown(doc, data_ctx)
    main = data_ctx.get("main") or (next(iter(data_ctx.values())) if data_ctx else None)
    row_count = len(main.rows) if main else 0

    image_b64 = None
    image_path = None
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
    )
