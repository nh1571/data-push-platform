"""High-quality chart rendering via pyecharts (ECharts).

Produces PNG (through existing Playwright HTML screenshot) for push images,
aligned with common BI report style (FineReport / DataEase / Superset level
defaults — not raw SVG sticks).
"""

from __future__ import annotations

import base64
import html as html_lib
from typing import Any

# pyecharts is optional at import time; callers handle ImportError fallback.


def _series_from_node(
    labels: list[str],
    values: list[float],
) -> tuple[list[str], list[float]]:
    return labels, values


def build_pyecharts_html(
    labels: list[str],
    values: list[float],
    *,
    chart_type: str = "bar",
    title: str = "",
    theme: str = "white",
    show_label: bool = True,
    smooth: bool = True,
    stack: bool = False,
    rose: bool = False,
    donut: bool = False,
    legend: bool = False,
    series_name: str = "数值",
    width_px: int = 680,
    height_px: int = 360,
    colors: list[str] | None = None,
) -> str:
    """Return a full HTML document ready for Playwright screenshot (#artboard)."""
    from pyecharts import options as opts
    from pyecharts.charts import Bar, Line, Pie
    from pyecharts.globals import ThemeType

    theme_map = {
        "white": ThemeType.WHITE,
        "dark": ThemeType.DARK,
        "macarons": ThemeType.MACARONS,
        "wonderland": ThemeType.WONDERLAND,
        "roma": ThemeType.ROMA,
        "shine": ThemeType.SHINE,
        "infographic": ThemeType.INFOGRAPHIC,
        "walden": ThemeType.WALDEN,
    }
    th = theme_map.get(str(theme).lower(), ThemeType.WHITE)
    ct = str(chart_type or "bar").lower()
    palette = colors or [
        "#5470c6",
        "#91cc75",
        "#fac858",
        "#ee6666",
        "#73c0de",
        "#3ba272",
        "#fc8452",
        "#9a60b4",
        "#ea7ccc",
    ]

    init = opts.InitOpts(
        width=f"{width_px}px",
        height=f"{height_px}px",
        theme=th,
        bg_color="#ffffff" if th == ThemeType.WHITE else None,
    )

    title_opts = opts.TitleOpts(
        title=title or None,
        title_textstyle_opts=opts.TextStyleOpts(font_size=14, font_weight="bold"),
        pos_left="center",
        pos_top="8",
    )
    legend_opts = (
        opts.LegendOpts(is_show=True, pos_bottom="0", pos_left="center")
        if legend
        else opts.LegendOpts(is_show=False)
    )
    tooltip = opts.TooltipOpts(trigger="axis" if ct in ("bar", "line", "area", "hbar") else "item")

    chart: Any
    if ct == "pie":
        data_pair = list(zip(labels, values, strict=False))
        radius = ["40%", "65%"] if donut else ["0%", "65%"]
        pie = Pie(init_opts=init)
        pie.add(
            series_name=series_name,
            data_pair=data_pair,
            radius=radius,
            rosetype="radius" if rose else None,
            label_opts=opts.LabelOpts(
                is_show=show_label,
                formatter="{b}\n{d}%",
                font_size=11,
            ),
        )
        pie.set_global_opts(
            title_opts=title_opts,
            legend_opts=legend_opts,
            tooltip_opts=opts.TooltipOpts(trigger="item", formatter="{b}: {c} ({d}%)"),
        )
        pie.set_colors(palette)
        chart = pie
    elif ct in ("line", "area"):
        line = Line(init_opts=init)
        line.add_xaxis(list(labels))
        y_kwargs: dict[str, Any] = {
            "series_name": series_name,
            "y_axis": list(values),
            "is_smooth": smooth,
            "label_opts": opts.LabelOpts(is_show=show_label, font_size=10),
            "linestyle_opts": opts.LineStyleOpts(width=2.5),
            "itemstyle_opts": opts.ItemStyleOpts(color=palette[0]),
        }
        if ct == "area":
            y_kwargs["areastyle_opts"] = opts.AreaStyleOpts(opacity=0.28)
        if stack:
            y_kwargs["stack"] = "total"
        line.add_yaxis(**y_kwargs)
        line.set_global_opts(
            title_opts=title_opts,
            legend_opts=legend_opts,
            tooltip_opts=tooltip,
            xaxis_opts=opts.AxisOpts(
                axislabel_opts=opts.LabelOpts(rotate=30 if len(labels) > 6 else 0, font_size=11),
                axistick_opts=opts.AxisTickOpts(is_align_with_label=True),
            ),
            yaxis_opts=opts.AxisOpts(
                splitline_opts=opts.SplitLineOpts(is_show=True),
            ),
        )
        chart = line
    elif ct == "hbar":
        bar = Bar(init_opts=init)
        bar.add_xaxis(list(labels))
        bar.add_yaxis(
            series_name=series_name,
            y_axis=list(values),
            label_opts=opts.LabelOpts(is_show=show_label, position="right", font_size=10),
            itemstyle_opts=opts.ItemStyleOpts(color=palette[0], border_radius=[0, 4, 4, 0]),
        )
        bar.reversal_axis()
        bar.set_colors(palette)
        bar.set_global_opts(
            title_opts=title_opts,
            legend_opts=legend_opts,
            tooltip_opts=tooltip,
            xaxis_opts=opts.AxisOpts(splitline_opts=opts.SplitLineOpts(is_show=True)),
            yaxis_opts=opts.AxisOpts(axislabel_opts=opts.LabelOpts(font_size=11)),
        )
        chart = bar
    else:
        # bar (default) — column
        bar = Bar(init_opts=init)
        bar.add_xaxis(list(labels))
        y_kwargs: dict[str, Any] = {
            "series_name": series_name,
            "y_axis": list(values),
            "category_gap": "35%",
            "label_opts": opts.LabelOpts(is_show=show_label, position="top", font_size=10),
            "itemstyle_opts": opts.ItemStyleOpts(
                border_radius=[4, 4, 0, 0],
                color=palette[0],
            ),
        }
        if stack:
            y_kwargs["stack"] = "total"
        bar.add_yaxis(**y_kwargs)
        bar.set_colors(palette)
        bar.set_global_opts(
            title_opts=title_opts,
            legend_opts=legend_opts,
            tooltip_opts=tooltip,
            xaxis_opts=opts.AxisOpts(
                axislabel_opts=opts.LabelOpts(rotate=30 if len(labels) > 6 else 0, font_size=11),
                axisline_opts=opts.AxisLineOpts(
                    linestyle_opts=opts.LineStyleOpts(color="#ccc")
                ),
            ),
            yaxis_opts=opts.AxisOpts(
                splitline_opts=opts.SplitLineOpts(
                    is_show=True,
                    linestyle_opts=opts.LineStyleOpts(type_="dashed", opacity=0.5),
                ),
            ),
        )
        chart = bar

    # Embed: self-contained page for screenshot
    embed = chart.render_embed()
    # pyecharts embed includes div+script; wrap for #artboard locator
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  body {{ margin:0; background:#fff; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }}
  #artboard {{ width:{width_px}px; margin:0 auto; padding:8px 8px 16px; background:#fff; box-sizing:border-box; }}
</style>
</head><body>
<div id="artboard">{embed}</div>
</body></html>"""


def chart_to_png_data_url(
    labels: list[str],
    values: list[float],
    props: dict[str, Any],
) -> tuple[str | None, str | None]:
    """Render chart to data URL PNG. Returns (data_url, error)."""
    if not labels or not values:
        return None, "图表无有效数据"

    try:
        html_doc = build_pyecharts_html(
            labels,
            values,
            chart_type=str(props.get("chart_type") or "bar"),
            title=str(props.get("title") or ""),
            theme=str(props.get("theme") or props.get("chart_theme") or "white"),
            show_label=props.get("show_label", True) is not False,
            smooth=props.get("smooth", True) is not False,
            stack=bool(props.get("stack")),
            rose=bool(props.get("rose")),
            donut=bool(props.get("donut")),
            legend=bool(props.get("legend")),
            series_name=str(props.get("series_name") or props.get("title") or "数值"),
            width_px=int(props.get("chart_width") or 680),
            height_px=int(props.get("chart_height") or 360),
        )
    except Exception as exc:  # noqa: BLE001
        return None, f"pyecharts 生成失败: {exc}"

    try:
        width = int(props.get("chart_width") or 680)
        png, _path = _html_to_png_chart(html_doc, width=width)
        if not png:
            return None, "图表截图失败（Playwright / Chromium）"
        b64 = base64.b64encode(png).decode("ascii")
        return f"data:image/png;base64,{b64}", None
    except Exception as exc:  # noqa: BLE001
        return None, f"图表截图异常: {exc}"


def _html_to_png_chart(html_doc: str, width: int = 680) -> tuple[bytes | None, str | None]:
    """Screenshot chart HTML with wait for ECharts canvas."""
    import tempfile
    from pathlib import Path

    from app.storage.local import LocalStorage

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "chart.png"
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(
                    viewport={"width": width + 40, "height": 480}
                )
                page.set_content(html_doc, wait_until="networkidle")
                # ECharts needs a tick to paint canvas
                page.wait_for_timeout(400)
                try:
                    page.wait_for_selector("canvas", timeout=3000)
                except Exception:
                    pass
                page.wait_for_timeout(200)
                page.locator("#artboard").screenshot(path=str(out))
                browser.close()
            if out.is_file() and out.stat().st_size > 0:
                data = out.read_bytes()
                path = LocalStorage().save_bytes(data, "chart.png")
                return data, path
        except Exception:
            return None, None
    return None, None


def chart_img_html(data_url: str, title: str = "") -> str:
    title_html = (
        f"<div class='comp-chart-title'>{html_lib.escape(title)}</div>" if title else ""
    )
    return (
        f"<div class='comp-chart'>{title_html}"
        f"<img src='{data_url}' alt='chart' style='width:100%;display:block;border-radius:4px'/>"
        f"</div>"
    )
