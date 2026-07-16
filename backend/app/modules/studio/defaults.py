"""Official artboard templates."""

from __future__ import annotations

from typing import Any
from uuid import uuid4


def _nid() -> str:
    return uuid4().hex[:12]


def empty_artboard(*, width: int = 750, theme_color: str = "#1677ff") -> dict[str, Any]:
    """Blank flow artboard with empty root container."""
    return {
        "version": 3,
        "kind": "artboard",
        "artboard": {
            "width": width,
            "height": None,
            "theme": {"color": theme_color, "table_style": "business"},
            "layout_default": "flow",
        },
        "datasets": [
            {
                "id": "main",
                "name": "主查询",
                "data_source_id": None,
                "sql": "SELECT 1 AS demo",
            }
        ],
        "tree": {
            "id": "root",
            "type": "Container",
            "props": {"direction": "column", "gap": 12},
            "children": [],
            "binding": {},
        },
        "compose": {"mode": "image_primary", "markdown_caption": True},
    }


def default_daily_artboard(*, theme_color: str = "#1677ff") -> dict[str, Any]:
    """Daily report template: title + KPI row + table + footer."""
    t1, k1, k2, tb, f1, row = _nid(), _nid(), _nid(), _nid(), _nid(), _nid()
    return {
        "version": 3,
        "kind": "artboard",
        "scene_id": "daily_report",
        "artboard": {
            "width": 750,
            "height": None,
            "theme": {"color": theme_color, "table_style": "business"},
            "layout_default": "flow",
        },
        "datasets": [
            {
                "id": "main",
                "name": "主查询",
                "data_source_id": None,
                "sql": (
                    "SELECT '演示院区' AS 院区, 1200 AS 门诊量, 80 AS 住院, "
                    "'12.5%' AS 同比\n"
                    "UNION ALL SELECT '对照', 980, 72, '-3.2%'"
                ),
            }
        ],
        "tree": {
            "id": "root",
            "type": "Container",
            "props": {"direction": "column", "gap": 12},
            "binding": {},
            "children": [
                {
                    "id": t1,
                    "type": "Text",
                    "props": {
                        "variant": "h1",
                        "text": "{{院区}} 运营日报",
                    },
                    "binding": {"dataset_id": "main"},
                    "visible": True,
                },
                {
                    "id": row,
                    "type": "Container",
                    "props": {"direction": "row", "gap": 8},
                    "binding": {},
                    "visible": True,
                    "children": [
                        {
                            "id": k1,
                            "type": "Kpi",
                            "props": {"label": "门诊量"},
                            "binding": {
                                "dataset_id": "main",
                                "value_column": "门诊量",
                                "label": "门诊量",
                            },
                            "visible": True,
                        },
                        {
                            "id": k2,
                            "type": "Kpi",
                            "props": {"label": "住院"},
                            "binding": {
                                "dataset_id": "main",
                                "value_column": "住院",
                                "label": "住院",
                            },
                            "visible": True,
                        },
                    ],
                },
                {
                    "id": tb,
                    "type": "Table",
                    "props": {"style": "business", "color_ratios": True, "max_rows": 50},
                    "binding": {"dataset_id": "main"},
                    "visible": True,
                },
                {
                    "id": _nid(),
                    "type": "Chart",
                    "props": {
                        "chart_type": "bar",
                        "title": "门诊量对比",
                        "max_rows": 12,
                    },
                    "binding": {
                        "dataset_id": "main",
                        "category_column": "院区",
                        "value_column": "门诊量",
                    },
                    "visible": True,
                },
                {
                    "id": f1,
                    "type": "Text",
                    "props": {
                        "variant": "caption",
                        "text": "数据来源：数据推送中台 · 仅供内部参考",
                    },
                    "binding": {},
                    "visible": True,
                },
            ],
        },
        "compose": {"mode": "image_primary", "markdown_caption": True},
    }
