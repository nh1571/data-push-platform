"""card renderer unit tests."""

from __future__ import annotations

from app.plugins.base import QueryResult
from app.plugins.renderer.card import CardRenderer, build_card_content


def test_build_card_content_summary() -> None:
    result = QueryResult(columns=["id", "name"], rows=[[1, "a"], [2, "b"]])
    card = build_card_content(result, title="日报", max_rows=10)
    assert card["title"] == "日报"
    assert card["row_count"] == 2
    assert card["columns"] == ["id", "name"]
    assert len(card["rows"]) == 2
    assert card["rows"][0] == {"id": 1, "name": "a"}
    assert "2" in card["text"]


def test_build_card_max_rows() -> None:
    rows = [[i] for i in range(20)]
    result = QueryResult(columns=["n"], rows=rows)
    card = build_card_content(result, max_rows=5)
    assert card["row_count"] == 20
    assert len(card["rows"]) == 5


def test_plugin_returns_card_part() -> None:
    plugin = CardRenderer()
    assert plugin.type == "card"
    parts = plugin.render(
        QueryResult(columns=["x"], rows=[[1]]),
        {"title": "T"},
        {},
    )
    assert len(parts) == 1
    assert parts[0].kind == "card"
    content = parts[0].content
    assert content["title"] == "T"
    assert "text" in content
    assert "rows" in content


def test_text_override() -> None:
    plugin = CardRenderer()
    parts = plugin.render(
        QueryResult(columns=["x"], rows=[[1]]),
        {"title": "T", "text": "custom body"},
        {},
    )
    assert parts[0].content["text"] == "custom body"
