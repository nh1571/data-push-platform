"""编辑器模块：轻量 design → Message、预览 API、保存任务。

对外 re-export design 层核心函数；HTTP 路由在 ``app.api.v1.editor``。
"""

from __future__ import annotations

from app.modules.editor.design import (
    build_message_from_design,
    design_to_parts,
    design_to_render_spec,
    result_to_markdown_table,
    substitute_first_row,
)

__all__ = [
    "build_message_from_design",
    "design_to_parts",
    "design_to_render_spec",
    "result_to_markdown_table",
    "substitute_first_row",
]
