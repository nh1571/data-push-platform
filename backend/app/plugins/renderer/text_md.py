"""Markdown 文本渲染器（``type="text_md"``）。

将 :class:`~app.plugins.base.QueryResult` 渲染为单个 text 类型
:class:`~app.plugins.base.MessagePart`，内容为 GitHub 风格 Markdown 表格
（单列时改用更易读的无序列表）。
"""

from __future__ import annotations

from typing import Any

from app.plugins.base import MessagePart, QueryResult


def _cell(value: Any) -> str:
    """单元格转义：None→空串，换行压空格，管道符转义以适配 markdown 表。"""
    if value is None:
        return ""
    text = str(value).replace("\n", " ").replace("|", "\\|")
    return text


def render_markdown_table(result: QueryResult, *, title: str | None = None) -> str:
    """将 *result* 构建为 Markdown 字符串（可选三级标题）。"""
    lines: list[str] = []
    if title:
        lines.append(f"### {title}")
        lines.append("")

    columns = result.columns or []
    rows = result.rows or []

    if not columns and not rows:
        lines.append("_(empty result)_")
        return "\n".join(lines)

    # 缺表头时按首行推断列数
    if not columns and rows:
        columns = [f"col_{i}" for i in range(len(rows[0]))]

    # 单列结果：无序列表比 1 列宽的表格更易读
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

    # 多列 markdown 表
    header = "| " + " | ".join(_cell(c) for c in columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    lines.append(header)
    lines.append(sep)
    if not rows:
        # 空数据仍保留表头结构，便于消费方看到列定义
        pass
    else:
        for row in rows:
            cells = [_cell(row[i]) if i < len(row) else "" for i in range(len(columns))]
            lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


class TextMarkdownRenderer:
    """产出 Markdown 文本的渲染器（``type="text_md"``）。

    配置键（均可选）：

    - ``title``: 可选，作为 markdown 正文前的标题
    """

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "text_md"

    def render(
        self,
        result: QueryResult,
        config: dict[str, Any],
        params: dict[str, Any],
    ) -> list[MessagePart]:
        """渲染为单个 kind=text 的 MessagePart。"""
        del params  # 预留给未来模板替换
        title = config.get("title")
        if title is not None:
            title = str(title)
        text = render_markdown_table(result, title=title)
        return [MessagePart(kind="text", content=text)]
