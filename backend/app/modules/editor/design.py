"""Editor design model: convert a lightweight design dict into Message / render parts.

Design keys (all optional unless noted)::

    output_mode: "markdown" | "image"   # default image when template_id set
    template_id: "report_v1" | "alert_v1" | "kpi_v1"
    title: str                # supports {{col}} from first query row
    theme_color: str          # hex color for image templates
    header_text: str          # supports {{col}} from first query row
    footer_text: str
    include_markdown_table: bool  # default True (markdown mode)
    show_table: bool          # default True (image templates)
    kpi_columns: list[str]    # for kpi_v1
    extra_parts: list[str]    # e.g. ["image_table"] (legacy)
"""

from __future__ import annotations

import re
from typing import Any

from app.modules.editor.templates import render_and_save_template
from app.plugins.base import Message, MessagePart, QueryResult
from app.plugins.registry import plugin_registry
from app.plugins.renderer.text_md import render_markdown_table

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def substitute_first_row(template: str, result: QueryResult) -> str:
    """Replace ``{{column_name}}`` placeholders with values from the first row.

    Unknown columns are left as empty strings. When there are no rows, all
    placeholders become empty.
    """
    if not template:
        return template

    columns = list(result.columns or [])
    first: list[Any] = list(result.rows[0]) if result.rows else []
    col_index = {name: i for i, name in enumerate(columns)}

    def _repl(match: re.Match[str]) -> str:
        name = match.group(1).strip()
        idx = col_index.get(name)
        if idx is None:
            return ""
        if idx >= len(first):
            return ""
        value = first[idx]
        return "" if value is None else str(value)

    return _PLACEHOLDER_RE.sub(_repl, template)


def result_to_markdown_table(result: QueryResult) -> str:
    """Build a GitHub-flavored markdown table from *result* (no title)."""
    return render_markdown_table(result, title=None)


def _wants_image_output(design: dict[str, Any]) -> bool:
    mode = design.get("output_mode")
    if mode is not None:
        return str(mode).lower() == "image"
    # Legacy: template_id alone implies image; pure markdown designs omit it.
    if design.get("template_id"):
        return True
    return False


def design_to_parts(design: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Convert a design dict into a list of ``{type, config}`` render parts.

    Used when normalizing ``render_spec`` that embeds a design key, and when
    persisting parts alongside the design on save. Runtime rendering prefers
    :func:`build_message_from_design` so placeholders can be resolved against
    live query data.
    """
    design = dict(design or {})
    parts: list[dict[str, Any]] = []

    if _wants_image_output(design):
        cfg: dict[str, Any] = {
            "template_id": design.get("template_id") or "report_v1",
        }
        if design.get("title"):
            cfg["title"] = str(design["title"])
        if design.get("theme_color"):
            cfg["theme_color"] = str(design["theme_color"])
        parts.append({"type": "template_image", "config": cfg})
        return parts

    # Primary text part — title from header when present.
    text_config: dict[str, Any] = {}
    header = design.get("header_text")
    if header:
        text_config["title"] = str(header)
    parts.append({"type": "text_md", "config": text_config})

    extra = design.get("extra_parts") or []
    if not isinstance(extra, list):
        extra = []
    for name in extra:
        rtype = str(name)
        if rtype == "image_table":
            img_cfg: dict[str, Any] = {}
            if design.get("title"):
                img_cfg["title"] = str(design["title"])
            elif header:
                img_cfg["title"] = str(header)
            parts.append({"type": "image_table", "config": img_cfg})
        else:
            parts.append({"type": rtype, "config": {}})

    return parts


def design_to_render_spec(design: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Alias for :func:`design_to_parts` (pipeline / save-job storage helper)."""
    return design_to_parts(design)


def _build_markdown_message(
    result: QueryResult,
    design: dict[str, Any],
    *,
    params: dict[str, Any] | None = None,
) -> Message:
    params = dict(params or {})
    sections: list[str] = []

    header = design.get("header_text")
    if header:
        sections.append(substitute_first_row(str(header), result))

    include_table = design.get("include_markdown_table", True)
    if include_table is None:
        include_table = True
    if include_table:
        sections.append(result_to_markdown_table(result))

    footer = design.get("footer_text")
    if footer:
        sections.append(substitute_first_row(str(footer), result))

    body = "\n\n".join(s for s in sections if s is not None and str(s).strip() != "")
    if not body:
        body = "_(empty message)_"

    parts: list[MessagePart] = [MessagePart(kind="text", content=body)]

    extra = design.get("extra_parts") or []
    if not isinstance(extra, list):
        extra = []
    for name in extra:
        rtype = str(name)
        try:
            renderer = plugin_registry.get("renderer", rtype)
        except KeyError:
            continue
        cfg: dict[str, Any] = {}
        if design.get("title"):
            cfg["title"] = str(design["title"])
        elif design.get("header_text"):
            cfg["title"] = str(design["header_text"])
        rendered = renderer.render(result, cfg, params)
        parts.extend(rendered)

    return Message(parts=parts)


def _build_image_message(
    result: QueryResult,
    design: dict[str, Any],
) -> Message:
    title = design.get("title") or design.get("header_text") or "数据推送"
    title_resolved = substitute_first_row(str(title), result) if title else "数据推送"
    png, path = render_and_save_template(result, design, filename="push_template.png")
    del png  # saved to path; channel plugins read from filesystem
    parts: list[MessagePart] = [
        MessagePart(
            kind="image",
            content={"path": path, "title": title_resolved},
        ),
        MessagePart(kind="text", content=title_resolved or "数据推送"),
    ]
    return Message(parts=parts)


def build_message_from_design(
    result: QueryResult,
    design: dict[str, Any] | None,
    *,
    params: dict[str, Any] | None = None,
) -> Message:
    """Build a :class:`Message` from a query result and an editor design.

    When ``output_mode`` is ``image`` (or ``template_id`` is set without an
    explicit markdown mode), generates a PNG via templates and returns an
    image part (plus a short text caption).

    Otherwise builds markdown body:

    1. ``header_text`` with first-row ``{{col}}`` substitution
    2. markdown table of rows when ``include_markdown_table`` is true (default)
    3. ``footer_text`` with the same substitution
    """
    design = dict(design or {})
    if _wants_image_output(design):
        return _build_image_message(result, design)
    return _build_markdown_message(result, design, params=params)
