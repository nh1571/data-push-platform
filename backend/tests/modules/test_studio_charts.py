"""ECharts chart rendering tests + 前后端 option 契约（P0）。"""

from __future__ import annotations

from app.modules.studio.charts import (
    DEFAULT_PALETTE,
    build_echarts_html,
    build_echarts_option,
    chart_to_png_data_url,
    resolve_echarts_js_path,
)
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


def test_option_reads_font_props_contract() -> None:
    """契约：title/label/axis 字号必须从 props 进入 option（对齐前端 chartOption）。"""
    opt = build_echarts_option(
        ["甲", "乙"],
        [1, 2],
        {
            "chart_type": "bar",
            "title": "门诊",
            "title_font_size": 22,
            "chart_label_size": 14,
            "axis_font_size": 13,
            "legend_font_size": 12,
            "show_legend": True,
            "show_label": True,
            "x_axis_name": "院区",
            "y_axis_name": "人次",
        },
    )
    assert opt["title"]["textStyle"]["fontSize"] == 22
    assert opt["series"][0]["label"]["fontSize"] == 14
    assert opt["xAxis"]["axisLabel"]["fontSize"] == 13
    assert opt["yAxis"]["axisLabel"]["fontSize"] == 13
    assert opt["xAxis"].get("name") == "院区"
    assert opt["yAxis"].get("name") == "人次"
    assert opt["legend"]["textStyle"]["fontSize"] == 12


def test_default_palette_contract() -> None:
    """默认色板与前端 chartOption.DEFAULT_PALETTE 一致。"""
    assert DEFAULT_PALETTE[0] == "#5470c6"
    assert len(DEFAULT_PALETTE) == 9
    opt = build_echarts_option(["a"], [1], {"chart_type": "bar"})
    assert opt["color"] == DEFAULT_PALETTE


def test_sort_desc_contract() -> None:
    opt = build_echarts_option(
        ["A", "B", "C"],
        [10, 30, 20],
        {"chart_type": "bar", "sort": "desc"},
    )
    assert opt["xAxis"]["data"] == ["B", "C", "A"]


def test_build_echarts_html_contains_script() -> None:
    opt = build_echarts_option(["x", "y"], [3, 7], {"chart_type": "pie", "donut": True})
    html = build_echarts_html(opt)
    assert "echarts" in html
    assert "artboard" in html


def test_resolve_echarts_prefers_local() -> None:
    path, kind = resolve_echarts_js_path()
    # CI/本机至少应命中 vendored static 或 node_modules
    if path:
        assert kind == "local"
        assert path.endswith("echarts.min.js")


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
