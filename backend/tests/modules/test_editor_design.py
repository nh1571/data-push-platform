"""Unit tests for editor design → message conversion."""

from __future__ import annotations

from app.modules.editor.design import (
    build_message_from_design,
    design_to_parts,
    result_to_markdown_table,
    substitute_first_row,
)
from app.plugins.base import QueryResult
from app.plugins.registry import plugin_registry
from app.plugins.renderer import register_builtin_renderers

register_builtin_renderers(plugin_registry)


def _result() -> QueryResult:
    return QueryResult(
        columns=["name", "amount"],
        rows=[["Alice", 100], ["Bob", 200]],
    )


def test_substitute_first_row() -> None:
    result = _result()
    assert substitute_first_row("Hello {{name}}, amount={{amount}}", result) == (
        "Hello Alice, amount=100"
    )
    assert substitute_first_row("no placeholders", result) == "no placeholders"
    assert substitute_first_row("{{missing}}", result) == ""


def test_substitute_empty_rows() -> None:
    result = QueryResult(columns=["name"], rows=[])
    assert substitute_first_row("Hi {{name}}", result) == "Hi "


def test_result_to_markdown_table() -> None:
    md = result_to_markdown_table(_result())
    assert "| name | amount |" in md or "| name |" in md
    assert "Alice" in md
    assert "Bob" in md
    assert "---" in md


def test_design_to_parts_default() -> None:
    parts = design_to_parts({"header_text": "日报 {{name}}"})
    assert parts[0]["type"] == "text_md"
    assert parts[0]["config"]["title"] == "日报 {{name}}"


def test_design_to_parts_with_image_table() -> None:
    parts = design_to_parts(
        {
            "header_text": "H",
            "extra_parts": ["image_table"],
        }
    )
    types = [p["type"] for p in parts]
    assert "text_md" in types
    assert "image_table" in types


def test_build_message_header_table_footer() -> None:
    message = build_message_from_design(
        _result(),
        {
            "header_text": "日报 — {{name}}",
            "footer_text": "— end —",
            "include_markdown_table": True,
            "output_mode": "markdown",
        },
    )
    assert len(message.parts) >= 1
    text = str(message.parts[0].content)
    assert "日报 — Alice" in text
    assert "Alice" in text
    assert "Bob" in text
    assert "— end —" in text


def test_build_message_without_table() -> None:
    message = build_message_from_design(
        _result(),
        {
            "header_text": "Only header {{name}}",
            "include_markdown_table": False,
            "output_mode": "markdown",
        },
    )
    text = str(message.parts[0].content)
    assert "Only header Alice" in text
    # Table separator should not appear when table disabled
    assert "---" not in text


def test_design_to_parts_image_mode() -> None:
    parts = design_to_parts(
        {
            "output_mode": "image",
            "template_id": "alert_v1",
            "title": "A",
        }
    )
    assert parts[0]["type"] == "template_image"
    assert parts[0]["config"]["template_id"] == "alert_v1"
