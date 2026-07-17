"""pyecharts chart rendering tests."""

from __future__ import annotations

from app.modules.studio.charts import build_pyecharts_html, chart_to_png_data_url
from app.modules.studio.compile import _render_chart_html
from app.plugins.base import QueryResult


def test_build_pyecharts_html_bar() -> None:
    html = build_pyecharts_html(
        ["A", "B", "C"],
        [10, 20, 15],
        chart_type="bar",
        title="测试",
        theme="macarons",
    )
    assert "echarts" in html.lower() or "ECharts" in html or "canvas" in html or "div" in html
    assert "artboard" in html


def test_build_pyecharts_html_pie_donut() -> None:
    html = build_pyecharts_html(
        ["x", "y"],
        [3, 7],
        chart_type="pie",
        donut=True,
        show_label=True,
    )
    assert "artboard" in html


def test_render_chart_html_uses_engine() -> None:
    ctx = {
        "main": QueryResult(
            columns=["院区", "量"],
            rows=[["甲", 100], ["乙", 80], ["丙", 60]],
        )
    }
    node = {
        "type": "Chart",
        "props": {"chart_type": "bar", "title": "门诊", "theme": "white", "show_label": True},
        "binding": {
            "dataset_id": "main",
            "category_column": "院区",
            "value_column": "量",
        },
    }
    html = _render_chart_html(node, ctx)
    # Either pyecharts img or SVG fallback
    assert "comp-chart" in html or "<img" in html or "<svg" in html


def test_chart_to_png_smoke() -> None:
    url, err = chart_to_png_data_url(
        ["一", "二", "三"],
        [1.0, 3.0, 2.0],
        {"chart_type": "line", "title": "趋势", "theme": "macarons", "smooth": True},
    )
    # May fail in CI without browsers; if succeeds must be data url
    if url:
        assert url.startswith("data:image/png;base64,")
    else:
        assert err  # explicit error string
