"""Card summary renderer (``type="card"``).

Produces a channel-agnostic card :class:`~app.plugins.base.MessagePart`
(``kind="card"``) with:

- ``title``: card title
- ``text``: short markdown/plain summary body
- ``rows``: list of row dicts (column → value) capped for display

Channels map this dict to provider-specific formats (e.g. DingTalk
``actionCard`` or markdown fallback).

Config keys (all optional):

- ``title``: card title (default ``数据卡片``)
- ``max_rows``: rows included in summary (default 10)
- ``text``: override body text (otherwise auto-built from the result)
"""

from __future__ import annotations

from typing import Any

from app.plugins.base import MessagePart, QueryResult


def _row_to_dict(columns: list[str], row: list[Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for i, col in enumerate(columns):
        out[str(col)] = row[i] if i < len(row) else None
    return out


def build_card_content(
    result: QueryResult,
    *,
    title: str = "数据卡片",
    max_rows: int = 10,
    text: str | None = None,
) -> dict[str, Any]:
    """Build a channel-agnostic card dict from *result*."""
    columns = list(result.columns or [])
    rows = list(result.rows or [])
    if not columns and rows:
        columns = [f"col_{i}" for i in range(len(rows[0]))]

    summary_rows = [_row_to_dict(columns, r) for r in rows[: max(0, max_rows)]]
    total = len(rows)

    if text is None:
        lines: list[str] = []
        lines.append(f"共 **{total}** 行" + (f"，展示前 {len(summary_rows)} 行" if total > len(summary_rows) else ""))
        if columns:
            lines.append("")
            lines.append("**字段**: " + ", ".join(str(c) for c in columns))
        if summary_rows:
            lines.append("")
            for i, rd in enumerate(summary_rows, start=1):
                pairs = ", ".join(f"{k}={v}" for k, v in rd.items())
                lines.append(f"{i}. {pairs}")
        elif not rows:
            lines.append("")
            lines.append("_(empty result)_")
        text = "\n".join(lines)

    return {
        "title": title,
        "text": text,
        "rows": summary_rows,
        "row_count": total,
        "columns": columns,
    }


class CardRenderer:
    """RendererPlugin that produces a card MessagePart (``type="card"``)."""

    @property
    def type(self) -> str:
        return "card"

    def render(
        self,
        result: QueryResult,
        config: dict[str, Any],
        params: dict[str, Any],
    ) -> list[MessagePart]:
        del params
        title = str(config.get("title") or "数据卡片")
        max_rows = int(config.get("max_rows") or 10)
        text_override = config.get("text")
        if text_override is not None:
            text_override = str(text_override)

        content = build_card_content(
            result,
            title=title,
            max_rows=max_rows,
            text=text_override,
        )
        return [MessagePart(kind="card", content=content)]
