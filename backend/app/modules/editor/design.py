"""Editor design model: convert a lightweight design dict into Message / render parts.

Design keys (all optional unless noted)::

    header_text: str          # supports {{col}} from first query row
    footer_text: str
    include_markdown_table: bool  # default True
    extra_parts: list[str]    # e.g. ["image_table"]
    title: str                # optional title for image_table etc.
"""

from __future__ import annotations

import re
from typing import Any

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


def design_to_parts(design: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Convert a design dict into a list of ``{type, config}`` render parts.

    Used when normalizing ``render_spec`` that embeds a design key, and when
    persisting parts alongside the design on save. Runtime rendering prefers
    :func:`build_message_from_design` so placeholders can be resolved against
    live query data.
    """
    design = dict(design or {})
    parts: list[dict[str, Any]] = []

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
            cfg: dict[str, Any] = {}
            if design.get("title"):
                cfg["title"] = str(design["title"])
            elif header:
                cfg["title"] = str(header)
            parts.append({"type": "image_table", "config": cfg})
        else:
            parts.append({"type": rtype, "config": {}})

    return parts


def design_to_render_spec(design: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Alias for :func:`design_to_parts` (pipeline / save-job storage helper)."""
    return design_to_parts(design)


def build_message_from_design(
    result: QueryResult,
    design: dict[str, Any] | None,
    *,
    params: dict[str, Any] | None = None,
) -> Message:
    """Build a :class:`Message` from a query result and an editor design.

    Markdown body:

    1. ``header_text`` with first-row ``{{col}}`` substitution
    2. markdown table of rows when ``include_markdown_table`` is true (default)
    3. ``footer_text`` with the same substitution

    Extra parts (e.g. ``image_table``) are rendered via registered renderer
    plugins and appended after the text part.
    """
    design = dict(design or {})
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
            # Unknown extra part: skip rather than fail preview/test.
            continue
        cfg: dict[str, Any] = {}
        if design.get("title"):
            cfg["title"] = str(design["title"])
        elif design.get("header_text"):
            cfg["title"] = str(design["header_text"])
        rendered = renderer.render(result, cfg, params)
        parts.extend(rendered)

    return Message(parts=parts)
