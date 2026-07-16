"""Editor module: design → message, preview APIs, save job."""

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
