"""HTML report builder tests (PNG may use pillow fallback)."""

from app.modules.editor.html_table import build_report_html, render_html_png
from app.plugins.base import QueryResult


def test_build_report_html_contains_table_and_ratio_class() -> None:
    result = QueryResult(
        columns=["dept", "yoy"],
        rows=[["内科", "25%"], ["外科", "-8%"]],
    )
    html = build_report_html(
        result,
        {
            "template_id": "report_v1",
            "title": "日报",
            "color_ratios": True,
            "show_table": True,
            "theme_color": "#1677ff",
        },
    )
    assert "日报" in html
    assert "内科" in html
    assert "r-pos-strong" in html
    assert "r-neg" in html
    assert "table class='data'" in html


def test_render_html_png_returns_png_bytes() -> None:
    result = QueryResult(columns=["a"], rows=[["1"], ["2"]])
    png = render_html_png(result, {"template_id": "report_v1", "title": "T"})
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(png) > 200
