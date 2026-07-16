"""Markdown text renderer (``type="text_md"``).

Renders a :class:`~app.plugins.base.QueryResult` into a single text
:class:`~app.plugins.base.MessagePart` containing a GitHub-flavored
markdown table (or a simple bullet list when there is a single column).
"""

from __future__ import annotations

from typing import Any

from app.plugins.base import MessagePart, QueryResult


def _cell(value: Any) -> str:
    """Stringify a cell value and escape pipe characters for markdown tables."""
    if value is None:
        return ""
    text = str(value).replace("\n", " ").replace("|", "\\|")
    return text


def render_markdown_table(result: QueryResult, *, title: str | None = None) -> str:
    """Build a markdown representation of *result*."""
    lines: list[str] = []
    if title:
        lines.append(f"### {title}")
        lines.append("")

    columns = result.columns or []
    rows = result.rows or []

    if not columns and not rows:
        lines.append("_(empty result)_")
        return "\n".join(lines)

    # Infer column count from first row if headers missing.
    if not columns and rows:
        columns = [f"col_{i}" for i in range(len(rows[0]))]

    # Single-column results: bullet list is more readable than a 1-wide table.
    if len(columns) == 1:
        col = columns[0]
        lines.append(f"**{col}**")
        if not rows:
            lines.append("- _(no rows)_")
        else:
            for row in rows:
                cell = _cell(row[0] if row else "")
                lines.append(f"- {cell}")
        return "\n".join(lines)

    # Multi-column markdown table
    header = "| " + " | ".join(_cell(c) for c in columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    lines.append(header)
    lines.append(sep)
    if not rows:
        # Keep table structure even when empty so consumers still see columns.
        pass
    else:
        for row in rows:
            cells = [_cell(row[i]) if i < len(row) else "" for i in range(len(columns))]
            lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


class TextMarkdownRenderer:
    """RendererPlugin that produces markdown text (``type="text_md"``).

    Config keys (all optional):

    - ``title``: optional heading prepended to the markdown body
    """

    @property
    def type(self) -> str:
        return "text_md"

    def render(
        self,
        result: QueryResult,
        config: dict[str, Any],
        params: dict[str, Any],
    ) -> list[MessagePart]:
        del params  # reserved for future template substitution
        title = config.get("title")
        if title is not None:
            title = str(title)
        text = render_markdown_table(result, title=title)
        return [MessagePart(kind="text", content=text)]
