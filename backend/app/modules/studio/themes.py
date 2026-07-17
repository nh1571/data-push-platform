"""画板主题包与表格样式 CSS 变量（设计器 S2）。"""

from __future__ import annotations

from typing import Any

# 命名主题包 — UI 展示；compile 解析为 CSS 变量
THEME_PACKS: dict[str, dict[str, str]] = {
    "business": {
        "id": "business",
        "label": "商务蓝",
        "color": "#1677ff",
        "header_bg": "#f0f5ff",
        "kpi_bg": "#fafcff",
        "bar_class": "",
    },
    "alert": {
        "id": "alert",
        "label": "告警红",
        "color": "#ff4d4f",
        "header_bg": "#fff1f0",
        "kpi_bg": "#fff7f6",
        "bar_class": "alert",
    },
    "forest": {
        "id": "forest",
        "label": "森绿",
        "color": "#389e0d",
        "header_bg": "#f6ffed",
        "kpi_bg": "#fcfff8",
        "bar_class": "",
    },
    "violet": {
        "id": "violet",
        "label": "紫晶",
        "color": "#722ed1",
        "header_bg": "#f9f0ff",
        "kpi_bg": "#fbf7ff",
        "bar_class": "",
    },
    "slate": {
        "id": "slate",
        "label": "沉稳灰",
        "color": "#434343",
        "header_bg": "#fafafa",
        "kpi_bg": "#f5f5f5",
        "bar_class": "",
    },
}

TABLE_STYLES: dict[str, dict[str, str]] = {
    "business": {
        "id": "business",
        "label": "商务",
        "font_size": "13px",
        "cell_pad": "8px 10px",
        "header_weight": "600",
    },
    "compact": {
        "id": "compact",
        "label": "紧凑",
        "font_size": "12px",
        "cell_pad": "4px 6px",
        "header_weight": "600",
    },
    "alert": {
        "id": "alert",
        "label": "告警",
        "font_size": "13px",
        "cell_pad": "8px 10px",
        "header_weight": "700",
    },
}


def resolve_theme(artboard_meta: dict[str, Any] | None) -> dict[str, str]:
    """合并主题包与显式 color 覆盖，产出 CSS 变量所需字段。"""
    meta = dict(artboard_meta or {})
    theme = dict(meta.get("theme") or {})
    pack_id = str(theme.get("pack") or theme.get("table_style") and theme.get("pack") or "business")
    # 优先显式 pack 键
    pack_id = str(theme.get("pack") or "business")
    if pack_id not in THEME_PACKS:
        pack_id = "business"
    pack = dict(THEME_PACKS[pack_id])
    if theme.get("color"):
        pack["color"] = str(theme["color"])
    table_style = str(theme.get("table_style") or "business")
    if table_style not in TABLE_STYLES:
        table_style = "business"
    pack["table_style"] = table_style
    pack["pack"] = pack_id
    return pack


def theme_css_vars(pack: dict[str, str]) -> str:
    """将主题 pack 转为 ``:root`` CSS 变量声明字符串。"""
    ts = TABLE_STYLES.get(pack.get("table_style") or "business", TABLE_STYLES["business"])
    return (
        f"--theme: {pack['color']}; "
        f"--header-bg: {pack.get('header_bg', '#f5f7fa')}; "
        f"--kpi-bg: {pack.get('kpi_bg', '#fafcff')}; "
        f"--table-fs: {ts['font_size']}; "
        f"--table-pad: {ts['cell_pad']}; "
        f"--table-hw: {ts['header_weight']};"
    )


def list_theme_packs() -> list[dict[str, str]]:
    """前端主题包下拉列表。"""
    return [
        {"id": p["id"], "label": p["label"], "color": p["color"]}
        for p in THEME_PACKS.values()
    ]


def list_table_styles() -> list[dict[str, str]]:
    """前端表格样式下拉列表。"""
    return [{"id": t["id"], "label": t["label"]} for t in TABLE_STYLES.values()]
