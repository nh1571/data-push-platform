"""卡片摘要渲染器（``type="card"``）。

产出通道无关的 card 类型 :class:`~app.plugins.base.MessagePart`
（``kind="card"``），content 为字典，包含：

- ``title``: 卡片标题
- ``text``: 简短 markdown/纯文本摘要正文
- ``rows``: 行 dict 列表（列名→值），展示行数有上限

各通道再将此 dict 映射为厂商格式（如钉钉 ``actionCard`` 或 markdown 回退）。

配置键（均可选）：

- ``title``: 卡片标题（默认 ``数据卡片``）
- ``max_rows``: 摘要中包含的行数（默认 10）
- ``text``: 覆盖正文（否则根据结果自动生成）
"""

from __future__ import annotations

from typing import Any

from app.plugins.base import MessagePart, QueryResult


def _row_to_dict(columns: list[str], row: list[Any]) -> dict[str, Any]:
    """将一行 list 按列名映射为 dict。"""
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
    """由 *result* 构建通道无关的卡片字典。"""
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
    """产出 card MessagePart 的渲染器（``type="card"``）。"""

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "card"

    def render(
        self,
        result: QueryResult,
        config: dict[str, Any],
        params: dict[str, Any],
    ) -> list[MessagePart]:
        """根据 config 生成单条 card 片段。"""
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
