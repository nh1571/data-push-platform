"""Studio artboard compile unit tests."""

from __future__ import annotations

from app.modules.studio.compile import build_artboard_html, build_artboard_markdown, compile_artboard
from app.modules.studio.defaults import default_daily_artboard
from app.modules.studio.migrate import design_to_artboard, is_artboard_spec
from app.plugins.base import QueryResult


def _sample_result() -> QueryResult:
    return QueryResult(
        columns=["院区", "门诊量", "住院", "同比"],
        rows=[
            ["演示院区", 1200, 80, "12.5%"],
            ["对照", 980, 72, "-3.2%"],
        ],
    )


def test_default_artboard_is_v3() -> None:
    doc = default_daily_artboard()
    assert is_artboard_spec(doc)
    assert doc["tree"]["type"] == "Container"
    assert len(doc["tree"]["children"]) >= 3


def test_compile_markdown_contains_title_and_table() -> None:
    doc = default_daily_artboard()
    ctx = {"main": _sample_result()}
    md = build_artboard_markdown(doc, ctx)
    assert "演示院区" in md
    assert "门诊量" in md
    assert "|" in md  # markdown table


def test_compile_html_has_kpi_and_table() -> None:
    doc = default_daily_artboard()
    ctx = {"main": _sample_result()}
    html = build_artboard_html(doc, ctx)
    assert "comp-kpi" in html
    assert "comp-table" in html
    assert "1200" in html
    assert "artboard" in html


def test_compile_artboard_message_parts() -> None:
    doc = default_daily_artboard()
    # force markdown to avoid screenshot dependency in CI
    doc = {**doc, "compose": {"mode": "markdown_primary", "markdown_caption": True}}
    result = compile_artboard(doc, {"main": _sample_result()}, want_image=False)
    assert result.row_count == 2
    assert result.markdown
    assert result.message.parts
    assert result.message.parts[0].kind == "text"


def test_chart_bar_and_pie_html() -> None:
    from app.modules.studio.compile import _render_chart_html

    result = _sample_result()
    ctx = {"main": result}
    bar = {
        "type": "Chart",
        "props": {"chart_type": "bar", "title": "门诊"},
        "binding": {
            "dataset_id": "main",
            "category_column": "院区",
            "value_column": "门诊量",
        },
    }
    pie = {
        "type": "Chart",
        "props": {"chart_type": "pie", "title": "占比"},
        "binding": {
            "dataset_id": "main",
            "category_column": "院区",
            "value_column": "住院",
        },
    }
    bar_html = _render_chart_html(bar, ctx)
    pie_html = _render_chart_html(pie, ctx)
    assert "<svg" in bar_html
    assert "rect" in bar_html
    assert "<svg" in pie_html
    assert "path" in pie_html or "circle" in pie_html
    assert "演示院区" in pie_html or "comp-chart" in pie_html


def test_design_to_artboard_migration() -> None:
    design = {
        "output_mode": "image",
        "title": "测试标题",
        "footer_text": "脚注",
        "theme_color": "#ff0000",
        "show_table": True,
    }
    board = design_to_artboard(design, data_source_id="abc", sql="SELECT 1")
    assert board["kind"] == "artboard"
    assert board["datasets"][0]["sql"] == "SELECT 1"
    types = [c["type"] for c in board["tree"]["children"]]
    assert "Text" in types
    assert "Table" in types
