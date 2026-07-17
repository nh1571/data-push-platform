"""编辑器 design 模型：轻量 design 字典 → Message / render parts。

Design 字段（除特别说明外均可选）::

    output_mode: "markdown" | "image"   # 有 template_id 时默认 image
    template_id: "report_v1" | "alert_v1" | "kpi_v1"
    title: str                # 支持首行 {{列名}}
    theme_color: str          # 图片模板主题色
    header_text / footer_text
    include_markdown_table: bool  # markdown 模式默认 True
    show_table: bool          # 图片模板默认 True
    kpi_columns: list[str]    # kpi_v1
    extra_parts: list[str]    # 如 ["image_table"]（遗留）
"""

from __future__ import annotations

import re
from typing import Any

from app.modules.editor.templates import render_and_save_template
from app.plugins.base import Message, MessagePart, QueryResult
from app.plugins.registry import plugin_registry
from app.plugins.renderer.text_md import render_markdown_table

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def substitute_first_row(template: str, result: QueryResult) -> str:
    """用查询结果首行替换 ``{{列名}}``；未知列或无行 → 空串。"""
    if not template:
        return template

    columns = list(result.columns or [])
    first: list[Any] = list(result.rows[0]) if result.rows else []
    col_index = {name: i for i, name in enumerate(columns)}

    def _repl(match: re.Match[str]) -> str:
        name = match.group(1).strip()
        idx = col_index.get(name)
        if idx is None:
            return ""
        if idx >= len(first):
            return ""
        value = first[idx]
        return "" if value is None else str(value)

    return _PLACEHOLDER_RE.sub(_repl, template)


def result_to_markdown_table(result: QueryResult) -> str:
    """由 *result* 生成 GitHub 风格 Markdown 表（无标题）。"""
    return render_markdown_table(result, title=None)


def _wants_image_output(design: dict[str, Any]) -> bool:
    """design 是否应按图片模式输出。"""
    mode = design.get("output_mode")
    if mode is not None:
        return str(mode).lower() == "image"
    # 兼容：仅有 template_id 即视为图片；纯 markdown design 不带该字段
    if design.get("template_id"):
        return True
    return False


def design_to_parts(design: dict[str, Any] | None) -> list[dict[str, Any]]:
    """design 字典 → ``{type, config}`` 渲染 part 列表。

    用于归一含 design 的 render_spec，以及保存时旁路持久化 parts。
    运行时渲染优先 :func:`build_message_from_design`，以便对活数据解析占位符。
    """
    design = dict(design or {})
    parts: list[dict[str, Any]] = []

    if _wants_image_output(design):
        cfg: dict[str, Any] = {
            "template_id": design.get("template_id") or "report_v1",
        }
        if design.get("title"):
            cfg["title"] = str(design["title"])
        if design.get("theme_color"):
            cfg["theme_color"] = str(design["theme_color"])
        parts.append({"type": "template_image", "config": cfg})
        return parts

    # 主文本 part — 有 header 时作 title
    text_config: dict[str, Any] = {}
    header = design.get("header_text")
    if header:
        text_config["title"] = str(header)
    parts.append({"type": "text_md", "config": text_config})

    extra = design.get("extra_parts") or []
    if not isinstance(extra, list):
        extra = []
    for name in extra:
        rtype = str(name)
        if rtype == "image_table":
            img_cfg: dict[str, Any] = {}
            if design.get("title"):
                img_cfg["title"] = str(design["title"])
            elif header:
                img_cfg["title"] = str(header)
            parts.append({"type": "image_table", "config": img_cfg})
        else:
            parts.append({"type": rtype, "config": {}})

    return parts


def design_to_render_spec(design: dict[str, Any] | None) -> list[dict[str, Any]]:
    """ :func:`design_to_parts` 别名（管线 / 保存任务存储辅助）。"""
    return design_to_parts(design)


def _build_markdown_message(
    result: QueryResult,
    design: dict[str, Any],
    *,
    params: dict[str, Any] | None = None,
) -> Message:
    """markdown 模式：header + 表 + footer + extra_parts。"""
    params = dict(params or {})
    sections: list[str] = []

    header = design.get("header_text")
    if header:
        sections.append(substitute_first_row(str(header), result))

    include_table = design.get("include_markdown_table", True)
    if include_table is None:
        include_table = True
    if include_table:
        sections.append(result_to_markdown_table(result))

    footer = design.get("footer_text")
    if footer:
        sections.append(substitute_first_row(str(footer), result))

    body = "\n\n".join(s for s in sections if s is not None and str(s).strip() != "")
    if not body:
        body = "_(empty message)_"

    parts: list[MessagePart] = [MessagePart(kind="text", content=body)]

    extra = design.get("extra_parts") or []
    if not isinstance(extra, list):
        extra = []
    for name in extra:
        rtype = str(name)
        try:
            renderer = plugin_registry.get("renderer", rtype)
        except KeyError:
            continue
        cfg: dict[str, Any] = {}
        if design.get("title"):
            cfg["title"] = str(design["title"])
        elif design.get("header_text"):
            cfg["title"] = str(design["header_text"])
        rendered = renderer.render(result, cfg, params)
        parts.extend(rendered)

    return Message(parts=parts)


def _build_image_message(
    result: QueryResult,
    design: dict[str, Any],
) -> Message:
    """image 模式：HTML/Pillow 成图 + 标题文本 part。"""
    title = design.get("title") or design.get("header_text") or "数据推送"
    title_resolved = substitute_first_row(str(title), result) if title else "数据推送"
    # 优先 HTML+CSS 截图（旧版表样式）；失败回退 Pillow
    try:
        from app.modules.editor.html_table import render_and_save_html

        png, path = render_and_save_html(result, design, filename="push_template.png")
    except Exception:
        png, path = render_and_save_template(result, design, filename="push_template.png")
    del png  # 已落盘 path；渠道插件从文件系统读图
    parts: list[MessagePart] = [
        MessagePart(
            kind="image",
            content={"path": path, "title": title_resolved},
        ),
        MessagePart(kind="text", content=title_resolved or "数据推送"),
    ]
    return Message(parts=parts)


def build_message_from_design(
    result: QueryResult,
    design: dict[str, Any] | None,
    *,
    params: dict[str, Any] | None = None,
) -> Message:
    """由查询结果与 editor design 构建 :class:`Message`。

    ``output_mode=image``（或仅设 template_id）时生成 PNG 图 + 短文案；
    否则组装 Markdown：header → 表（可选）→ footer，均支持首行 ``{{col}}``。
    """
    design = dict(design or {})
    if _wants_image_output(design):
        return _build_image_message(result, design)
    return _build_markdown_message(result, design, params=params)
