"""基于 Apache ECharts 的图表渲染（主流 BI 技术栈）。

前端预览即时完成；服务端仅在最终推送出图时构建 option JSON + HTML，
再经 Playwright 截图嵌入画板。
"""

from __future__ import annotations

import base64
import json
from typing import Any


DEFAULT_PALETTE = [
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


def _prepare(
    labels: list[str],
    values: list[float],
    props: dict[str, Any],
) -> tuple[list[str], list[float]]:
    """排序 / top-n，对齐前端 chartOption.prepareAxisData（单系列）。"""
    pairs = list(zip(labels, values, strict=False))
    sort = str(props.get("sort") or "none")
    if sort == "asc":
        pairs.sort(key=lambda x: x[1])
    elif sort == "desc":
        pairs.sort(key=lambda x: x[1], reverse=True)
    top_n = props.get("top_n")
    if top_n:
        try:
            pairs = pairs[: int(top_n)]
        except (TypeError, ValueError):
            pass
    if not pairs:
        return [], []
    labs, vals = zip(*pairs, strict=False)
    return list(labs), list(vals)


def build_echarts_option(
    labels: list[str],
    values: list[float],
    props: dict[str, Any] | None = None,
    *,
    multi_series: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """构建 ECharts option 字典（与前端 chartOption.ts 对齐）。"""
    props = dict(props or {})
    labels, values = _prepare(labels, values, props)
    ct = str(props.get("chart_type") or "bar").lower()
    palette = props.get("color_palette") or DEFAULT_PALETTE
    show_label = props.get("show_label", True) is not False
    show_legend = bool(props.get("legend") or props.get("show_legend"))
    show_grid = props.get("show_grid", True) is not False
    title = str(props.get("title") or "")
    subtitle = str(props.get("subtitle") or "")
    series_name = str(props.get("series_name") or title or "数值")

    option: dict[str, Any] = {
        "color": palette,
        "backgroundColor": "transparent",
        "tooltip": {
            "trigger": "item" if ct == "pie" else "axis",
            "axisPointer": {"type": "shadow"} if ct != "pie" else None,
        },
        "legend": (
            {"show": True, "bottom": 4, "left": "center", "type": "scroll"}
            if show_legend or (multi_series and len(multi_series) > 1)
            else {"show": False}
        ),
    }
    if title:
        option["title"] = {
            "text": title,
            "subtext": subtitle or None,
            "left": "center",
            "top": 6,
            "textStyle": {"fontSize": 15, "fontWeight": 600},
        }

    if ct == "pie":
        data = [{"name": n, "value": v} for n, v in zip(labels, values, strict=False)]
        option["series"] = [
            {
                "name": series_name,
                "type": "pie",
                "radius": ["42%", "68%"] if props.get("donut") else ["0%", "68%"],
                "center": ["50%", "55%"],
                "roseType": "radius" if props.get("rose") else None,
                "itemStyle": {"borderRadius": 4, "borderColor": "#fff", "borderWidth": 2},
                "label": {
                    "show": show_label,
                    "formatter": "{b}\n{d}%",
                    "fontSize": 11,
                },
                "data": data,
            }
        ]
        return option

    is_h = ct == "hbar" or bool(props.get("horizontal"))
    cat_axis = {
        "type": "category",
        "data": labels,
        "axisLabel": {
            "rotate": 0 if is_h else (30 if len(labels) > 8 else int(props.get("x_label_rotate") or 0)),
            "fontSize": 11,
        },
    }
    val_axis = {
        "type": "value",
        "splitLine": {
            "show": show_grid,
            "lineStyle": {"type": "dashed", "opacity": 0.5},
        },
    }
    option["grid"] = {
        "left": 48,
        "right": 24,
        "top": 56 if title else 32,
        "bottom": 48 if show_legend else 36,
        "containLabel": True,
    }
    option["xAxis"] = val_axis if is_h else cat_axis
    option["yAxis"] = cat_axis if is_h else val_axis

    series_defs = multi_series
    if not series_defs:
        series_defs = [{"name": series_name, "values": values}]

    series_out: list[dict[str, Any]] = []
    for s in series_defs:
        name = str(s.get("name") or series_name)
        data = list(s.get("values") or values)
        if ct in ("line", "area"):
            series_out.append(
                {
                    "name": name,
                    "type": "line",
                    "data": data,
                    "smooth": props.get("smooth", True) is not False,
                    "stack": "total" if props.get("stack") else None,
                    "symbol": "circle",
                    "symbolSize": 6,
                    "lineStyle": {"width": int(props.get("line_width") or 2.5)},
                    "areaStyle": (
                        {"opacity": float(props.get("area_opacity") or 0.28)}
                        if ct == "area"
                        else None
                    ),
                    "label": {
                        "show": show_label,
                        "position": str(props.get("label_position") or "top"),
                        "fontSize": 10,
                    },
                }
            )
        else:
            br = int(props.get("bar_border_radius") or 4)
            series_out.append(
                {
                    "name": name,
                    "type": "bar",
                    "data": data,
                    "stack": "total" if props.get("stack") else None,
                    "barMaxWidth": 48,
                    "itemStyle": {
                        "borderRadius": [0, br, br, 0] if is_h else [br, br, 0, 0],
                    },
                    "label": {
                        "show": show_label,
                        "position": "right" if is_h else str(props.get("label_position") or "top"),
                        "fontSize": 10,
                    },
                }
            )
    option["series"] = series_out
    return option


# ECharts 5 精简版 — 最终截图页从 CDN 加载
_ECHARTS_CDN = "https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"


def build_echarts_html(
    option: dict[str, Any],
    *,
    width_px: int = 680,
    height_px: int = 360,
) -> str:
    """含 ECharts 的完整 HTML 页，供 Playwright 截 ``#artboard``。"""
    opt_json = json.dumps(option, ensure_ascii=False)
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<script src="{_ECHARTS_CDN}"></script>
<style>
body {{ margin:0; background:#fff; }}
#artboard {{ width:{width_px}px; margin:0 auto; padding:8px; background:#fff; box-sizing:border-box; }}
#chart {{ width:100%; height:{height_px}px; }}
</style></head><body>
<div id="artboard"><div id="chart"></div></div>
<script>
  var chart = echarts.init(document.getElementById('chart'));
  chart.setOption({opt_json});
</script>
</body></html>"""


def chart_to_png_data_url(
    labels: list[str],
    values: list[float],
    props: dict[str, Any],
) -> tuple[str | None, str | None]:
    """服务端图表 PNG（推送管线）。返回 (data_url, error)。"""
    if not labels or not values:
        return None, "图表无有效数据"

    # 多系列：props.value_series = [{name, values}, ...]
    multi = props.get("value_series")
    option = build_echarts_option(
        labels,
        values,
        props,
        multi_series=multi if isinstance(multi, list) else None,
    )
    width = int(props.get("chart_width") or 680)
    height = int(props.get("chart_height") or 360)
    html_doc = build_echarts_html(option, width_px=width, height_px=height)

    try:
        png, _path = _html_to_png_chart(html_doc, width=width, height=height)
        if not png:
            return None, "图表截图失败（Playwright / Chromium）"
        b64 = base64.b64encode(png).decode("ascii")
        return f"data:image/png;base64,{b64}", None
    except Exception as exc:  # noqa: BLE001
        return None, f"图表截图异常: {exc}"


def _html_to_png_chart(
    html_doc: str, width: int = 680, height: int = 360
) -> tuple[bytes | None, str | None]:
    """Playwright 截图图表 HTML，返回 (png_bytes, storage_path)。"""
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
                    viewport={"width": width + 48, "height": height + 80}
                )
                page.set_content(html_doc, wait_until="networkidle")
                try:
                    page.wait_for_selector("canvas", timeout=5000)
                except Exception:
                    page.wait_for_timeout(500)
                page.wait_for_timeout(150)
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
    """将图表 data URL 包成画板内嵌 ``<img>`` HTML 片段。"""
    import html as html_lib

    title_html = (
        f"<div class='comp-chart-title'>{html_lib.escape(title)}</div>" if title else ""
    )
    return (
        f"<div class='comp-chart'>{title_html}"
        f"<img src='{data_url}' alt='chart' style='width:100%;display:block;border-radius:4px'/>"
        f"</div>"
    )
