"""ECharts chart rendering tests."""

from __future__ import annotations

from app.modules.studio.charts import build_echarts_html, build_echarts_option, chart_to_png_data_url
from app.modules.studio.compile import _render_chart_html
from app.plugins.base import QueryResult


def test_build_echarts_option_bar() -> None:
    opt = build_echarts_option(
        ["A", "B", "C"],
        [10, 20, 15],
        {"chart_type": "bar", "title": "测试", "show_label": True},
    )
    assert opt["series"][0]["type"] == "bar"
    assert opt["xAxis"]["data"] == ["A", "B", "C"]


def test_build_echarts_html_contains_script() -> None:
    opt = build_echarts_option(["x", "y"], [3, 7], {"chart_type": "pie", "donut": True})
    html = build_echarts_html(opt)
    assert "echarts" in html
    assert "artboard" in html


def test_render_chart_html_engine() -> None:
    ctx = {
        "main": QueryResult(
            columns=["院区", "量"],
            rows=[["甲", 100], ["乙", 80], ["丙", 60]],
        )
    }
    node = {
        "type": "Chart",
        "props": {"chart_type": "bar", "title": "门诊", "show_label": True},
        "binding": {
            "dataset_id": "main",
            "category_column": "院区",
            "value_column": "量",
        },
    }
    html = _render_chart_html(node, ctx)
    assert "comp-chart" in html or "<img" in html or "<svg" in html


def test_chart_to_png_smoke() -> None:
    url, err = chart_to_png_data_url(
        ["一", "二", "三"],
        [1.0, 3.0, 2.0],
        {"chart_type": "line", "title": "趋势", "smooth": True},
    )
    if url:
        assert url.startswith("data:image/png;base64,")
    else:
        assert err
