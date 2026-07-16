"""Migrate legacy design / blocks into artboard v3."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.modules.studio.defaults import default_daily_artboard, empty_artboard


def _nid() -> str:
    return uuid4().hex[:12]


def is_artboard_spec(spec: Any) -> bool:
    """True when render_spec or nested object is an artboard document."""
    if not isinstance(spec, dict):
        return False
    if spec.get("kind") == "artboard" or int(spec.get("version") or 0) >= 3:
        return True
    if isinstance(spec.get("artboard"), dict) and isinstance(spec.get("tree"), dict):
        return True
    # nested under render_spec
    inner = spec.get("artboard_doc") or spec.get("studio")
    return is_artboard_spec(inner) if isinstance(inner, dict) else False


def extract_artboard(spec: Any) -> dict[str, Any] | None:
    """Pull artboard document from render_spec or return None."""
    if not isinstance(spec, dict):
        return None
    if is_artboard_spec(spec) and "tree" in spec:
        return spec
    for key in ("artboard_doc", "studio", "artboard_spec"):
        inner = spec.get(key)
        if isinstance(inner, dict) and is_artboard_spec(inner):
            return inner
    return None


def design_to_artboard(
    design: dict[str, Any] | None,
    *,
    data_source_id: str | None = None,
    sql: str | None = None,
) -> dict[str, Any]:
    """Convert legacy editor DesignSpec into a single-column artboard."""
    design = dict(design or {})
    theme = str(design.get("theme_color") or "#1677ff")
    board = empty_artboard(theme_color=theme)
    if data_source_id:
        board["datasets"][0]["data_source_id"] = data_source_id
    if sql:
        board["datasets"][0]["sql"] = sql

    children: list[dict[str, Any]] = []
    title = design.get("title") or design.get("header_text")
    if title:
        children.append(
            {
                "id": _nid(),
                "type": "Text",
                "props": {"variant": "h1", "text": str(title)},
                "binding": {"dataset_id": "main"},
                "visible": True,
            }
        )
    header = design.get("header_text")
    if header and design.get("title") and str(header) != str(design.get("title")):
        children.append(
            {
                "id": _nid(),
                "type": "Text",
                "props": {"variant": "body", "text": str(header)},
                "binding": {"dataset_id": "main"},
                "visible": True,
            }
        )

    kpi_cols = design.get("kpi_columns") or []
    if design.get("template_id") == "kpi_v1" or kpi_cols:
        row_children = []
        cols = [str(c) for c in kpi_cols][:4] if kpi_cols else []
        if not cols:
            # placeholder KPIs filled at runtime from first columns
            cols = ["_auto0", "_auto1", "_auto2"]
        for i, col in enumerate(cols):
            row_children.append(
                {
                    "id": _nid(),
                    "type": "Kpi",
                    "props": {"label": col if not col.startswith("_auto") else ""},
                    "binding": {
                        "dataset_id": "main",
                        "value_column": col if not col.startswith("_auto") else "",
                        "auto_index": i if col.startswith("_auto") else None,
                        "label": col if not col.startswith("_auto") else "",
                    },
                    "visible": True,
                }
            )
        children.append(
            {
                "id": _nid(),
                "type": "Container",
                "props": {"direction": "row", "gap": 8},
                "binding": {},
                "visible": True,
                "children": row_children,
            }
        )

    show_table = design.get("show_table", True)
    if show_table is not False:
        children.append(
            {
                "id": _nid(),
                "type": "Table",
                "props": {
                    "style": "business",
                    "color_ratios": design.get("color_ratios", True) is not False,
                    "max_rows": 50,
                },
                "binding": {"dataset_id": "main"},
                "visible": True,
            }
        )

    footer = design.get("footer_text")
    if footer:
        children.append(
            {
                "id": _nid(),
                "type": "Text",
                "props": {"variant": "caption", "text": str(footer)},
                "binding": {"dataset_id": "main"},
                "visible": True,
            }
        )

    if not children:
        return default_daily_artboard(theme_color=theme)

    board["tree"]["children"] = children
    mode = design.get("output_mode") or ("image" if design.get("template_id") else "image")
    board["compose"] = {
        "mode": "markdown_primary" if mode == "markdown" else "image_primary",
        "markdown_caption": True,
    }
    return board
