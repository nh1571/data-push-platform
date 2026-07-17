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


def test_theme_pack_css_in_html() -> None:
    doc = default_daily_artboard()
    doc["artboard"]["theme"] = {"pack": "alert", "table_style": "alert"}
    html = build_artboard_html(doc, {"main": _sample_result()})
    assert "#ff4d4f" in html or "alert" in html
    assert "artboard-chrome" in html


def test_line_chart_svg() -> None:
    from app.modules.studio.compile import _render_chart_html

    result = QueryResult(columns=["日", "量"], rows=[["一", 10], ["二", 20], ["三", 15]])
    html = _render_chart_html(
        {
            "type": "Chart",
            "props": {"chart_type": "line", "title": "趋势", "theme": "macarons"},
            "binding": {
                "dataset_id": "main",
                "category_column": "日",
                "value_column": "量",
            },
        },
        {"main": result},
    )
    assert "comp-chart" in html or "<img" in html or "<svg" in html


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
    # pyecharts path embeds PNG <img>; SVG is fallback only
    assert "comp-chart" in bar_html or "<img" in bar_html or "<svg" in bar_html
    assert "comp-chart" in pie_html or "<img" in pie_html or "<svg" in pie_html


def test_push_shell_text_around_image() -> None:
    """Assemble-push: text_before / text_after wrap the canvas image."""
    from app.modules.studio.compile import artboard_to_message

    doc = {
        "artboard": {"width": 750, "show_chrome": False},
        "tree": {
            "type": "Container",
            "children": [
                {
                    "type": "Text",
                    "props": {"text": "画布内"},
                }
            ],
        },
        "compose": {
            "mode": "image_primary",
            "include_component_md": False,
            "title": "{{院区}}日报",
            "text_before": "**【{{院区}}】今日简报**",
            "text_after": "共 {{门诊量}} 人次",
        },
    }
    msg = artboard_to_message(doc, {"main": _sample_result()}, with_image=False)
    kinds = [p.kind for p in msg.parts]
    texts = [str(p.content) for p in msg.parts if p.kind == "text"]
    assert "text" in kinds
    assert any("演示院区" in t for t in texts)
    assert any("1200" in t for t in texts)
    # without image engine / with_image=False, shell text still present
    assert len(texts) >= 1


def test_free_compose_layout_absolute_html() -> None:
    """Assemble free-canvas coords render as absolute positioned shells."""
    doc = {
        "scene_id": "free",
        "artboard": {
            "width": 750,
            "show_chrome": True,
            "chrome_title": "自由布局",
            "theme": {"pack": "business", "color": "#1677ff"},
        },
        "tree": {
            "type": "Container",
            "id": "root",
            "children": [
                {
                    "type": "Text",
                    "id": "t1",
                    "props": {
                        "text": "标题",
                        "compose_x": 20,
                        "compose_y": 30,
                        "compose_w": 300,
                        "compose_h": 80,
                        "compose_style": "card",
                    },
                },
                {
                    "type": "Kpi",
                    "id": "k1",
                    "props": {
                        "label": "指标",
                        "compose_x": 340,
                        "compose_y": 30,
                        "compose_w": 200,
                        "compose_h": 100,
                        "compose_style": "shadow",
                        "compose_color": "#ff4d4f",
                    },
                    "binding": {"dataset_id": "main", "value_column": "门诊量"},
                },
            ],
        },
    }
    html = build_artboard_html(doc, {"main": _sample_result()})
    assert "artboard-body free" in html
    assert "comp-freeboard" in html
    assert "comp-free card" in html
    assert "comp-free shadow" in html
    assert "left:20px" in html
    assert "top:30px" in html
    assert "width:300px" in html
    assert "height:80px" in html


def test_multi_canvas_segments_message_order() -> None:
    """多画布合成一条推送：文案合并为一段，不拆成多条 image。"""
    from app.modules.studio.compile import artboard_to_message, build_artboard_html, list_canvases

    doc = {
        "artboard": {"width": 750, "show_chrome": False},
        "canvases": [
            {
                "id": "c1",
                "name": "画布A",
                "tree": {
                    "type": "Container",
                    "children": [{"type": "Text", "props": {"text": "图A内容"}}],
                },
            },
            {
                "id": "c2",
                "name": "画布B",
                "tree": {
                    "type": "Container",
                    "children": [{"type": "Text", "props": {"text": "图B内容"}}],
                },
            },
        ],
        "tree": {
            "type": "Container",
            "children": [{"type": "Text", "props": {"text": "legacy"}}],
        },
        "compose": {
            "mode": "image_primary",
            "include_component_md": False,
            "title": "多图画报",
            "segments": [
                {"id": "s1", "type": "text", "html": "开场 {{院区}}"},
                {"id": "s2", "type": "canvas", "canvas_id": "c1"},
                {"id": "s3", "type": "text", "html": "中间说明"},
                {"id": "s4", "type": "canvas", "canvas_id": "c2"},
                {"id": "s5", "type": "text", "html": "结尾"},
            ],
        },
    }
    assert len(list_canvases(doc)) == 2
    # HTML 纵向包含两块画布
    html = build_artboard_html(doc, {"main": _sample_result()})
    assert "图A内容" in html
    assert "图B内容" in html
    assert "artboard-stack" in html

    msg = artboard_to_message(doc, {"main": _sample_result()}, with_image=False)
    texts = [str(p.content) for p in msg.parts if p.kind == "text"]
    # 多段文案合并为一段
    assert len(texts) == 1
    assert "演示院区" in texts[0]
    assert "中间说明" in texts[0]
    assert "结尾" in texts[0]
    # 无多条 image（with_image=False 时甚至无 image）
    assert all(p.kind == "text" for p in msg.parts)
    image_parts = [p for p in msg.parts if p.kind == "image"]
    assert len(image_parts) == 0


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
