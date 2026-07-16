"""Tests for percentage cell coloring in image templates."""

from app.modules.editor.templates import _ratio_text_color, render_template_png
from app.plugins.base import QueryResult


def test_ratio_colors() -> None:
    assert _ratio_text_color("25%", enabled=True) == (0, 87, 55)
    assert _ratio_text_color("10%", enabled=True) == (0, 176, 80)
    assert _ratio_text_color("-5%", enabled=True) == (255, 0, 0)
    assert _ratio_text_color("-25%", enabled=True) == (144, 0, 0)
    assert _ratio_text_color("hello", enabled=True) == (30, 30, 30)
    assert _ratio_text_color("25%", enabled=False) == (30, 30, 30)


def test_template_png_with_ratios() -> None:
    result = QueryResult(
        columns=["科室", "同比"],
        rows=[["内科", "25%"], ["外科", "-12%"]],
    )
    png = render_template_png(
        result,
        {
            "template_id": "report_v1",
            "title": "测试",
            "color_ratios": True,
            "show_table": True,
        },
    )
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(png) > 500
