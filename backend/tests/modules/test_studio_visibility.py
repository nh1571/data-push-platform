"""Visibility condition evaluation for studio artboard."""

from __future__ import annotations

from app.modules.studio.compile import _eval_visible_when, _visible, build_artboard_html
from app.plugins.base import QueryResult


def test_visible_when_row_count() -> None:
    empty = QueryResult(columns=["a"], rows=[])
    full = QueryResult(columns=["a"], rows=[[1], [2]])
    assert _eval_visible_when("row_count>0", {"main": empty}, {}) is False
    assert _eval_visible_when("row_count>0", {"main": full}, {}) is True
    assert _eval_visible_when("row_count==0", {"main": empty}, {}) is True
    assert _eval_visible_when("never", {"main": full}, {}) is False
    assert _eval_visible_when("always", {"main": empty}, {}) is True


def test_hidden_component_not_in_html() -> None:
    doc = {
        "artboard": {"width": 750, "theme": {"pack": "business"}, "show_chrome": False},
        "tree": {
            "id": "root",
            "type": "Container",
            "props": {"direction": "column"},
            "children": [
                {
                    "id": "t1",
                    "type": "Text",
                    "props": {"variant": "body", "text": "VISIBLE_TEXT", "visible_when": "row_count>0"},
                    "binding": {"dataset_id": "main"},
                },
                {
                    "id": "t2",
                    "type": "Text",
                    "props": {"variant": "body", "text": "HIDDEN_WHEN_EMPTY", "visible_when": "row_count>0"},
                    "binding": {"dataset_id": "main"},
                },
            ],
        },
    }
    empty = {"main": QueryResult(columns=["x"], rows=[])}
    html_empty = build_artboard_html(doc, empty)
    assert "VISIBLE_TEXT" not in html_empty
    assert "HIDDEN_WHEN_EMPTY" not in html_empty

    full = {"main": QueryResult(columns=["x"], rows=[[1]])}
    html_full = build_artboard_html(doc, full)
    assert "VISIBLE_TEXT" in html_full


def test_visible_flag_false() -> None:
    node = {"visible": False, "props": {}, "binding": {}}
    assert _visible(node, {"main": QueryResult(columns=[], rows=[])}) is False
