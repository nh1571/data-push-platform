"""text_md renderer unit tests."""

from __future__ import annotations

from app.plugins.base import QueryResult
from app.plugins.renderer.text_md import TextMarkdownRenderer, render_markdown_table


def test_render_markdown_table_multi_column() -> None:
    result = QueryResult(columns=["id", "name"], rows=[[1, "a"], [2, "b"]])
    md = render_markdown_table(result, title="Demo")
    assert "### Demo" in md
    assert "| id | name |" in md
    assert "| 1 | a |" in md


def test_render_single_column_list() -> None:
    result = QueryResult(columns=["name"], rows=[["alice"], ["bob"]])
    md = render_markdown_table(result)
    assert "**name**" in md
    assert "- alice" in md
    assert "- bob" in md


def test_render_empty() -> None:
    result = QueryResult(columns=[], rows=[])
    md = render_markdown_table(result)
    assert "empty" in md.lower()


def test_plugin_returns_text_part() -> None:
    plugin = TextMarkdownRenderer()
    assert plugin.type == "text_md"
    parts = plugin.render(
        QueryResult(columns=["x"], rows=[[1]]),
        {"title": "T"},
        {},
    )
    assert len(parts) == 1
    assert parts[0].kind == "text"
    assert "1" in str(parts[0].content)
