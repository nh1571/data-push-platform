"""表格转图片渲染器（``type="image_table"``）。

使用 Pillow 将 :class:`~app.plugins.base.QueryResult` 画成简易 PNG 表格图，
经 :class:`~app.storage.local.LocalStorage` 落盘，并返回
``kind="image"`` 的 :class:`~app.plugins.base.MessagePart`。

配置键（均可选）：

- ``title``: 表格上方标题
- ``filename``: 输出文件名（默认 ``table.png``）
- ``max_rows``: 最多绘制行数（默认 50）
- ``storage_root``: 覆盖本地存储根
"""

from __future__ import annotations

from io import BytesIO
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from app.plugins.base import MessagePart, QueryResult
from app.storage.local import LocalStorage

# 布局与配色常量
_PAD_X = 10
_PAD_Y = 6
_CELL_MIN_W = 48
_MAX_CELL_CHARS = 40
_BG = (255, 255, 255)
_FG = (30, 30, 30)
_HEADER_BG = (240, 242, 245)
_GRID = (200, 200, 200)
_TITLE_FG = (20, 20, 20)


def _cell_text(value: Any) -> str:
    """单元格显示文本：截断过长内容并压平换行。"""
    if value is None:
        return ""
    text = str(value).replace("\n", " ")
    if len(text) > _MAX_CELL_CHARS:
        return text[: _MAX_CELL_CHARS - 1] + "…"
    return text


def _font(size: int = 14) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    """尝试加载 TrueType 字体，失败则回退系统/默认位图字体。"""
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size=size)
    except OSError:
        try:
            # macOS 常见回退字体
            return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size=size)
        except OSError:
            return ImageFont.load_default()


def _text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    """测量文本宽高（基于 textbbox）。"""
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def render_table_png(
    result: QueryResult,
    *,
    title: str | None = None,
    max_rows: int = 50,
) -> bytes:
    """将 *result* 渲染为 PNG 表格图，返回原始字节。"""
    columns = list(result.columns or [])
    rows = list(result.rows or [])[: max(0, max_rows)]

    if not columns and rows:
        columns = [f"col_{i}" for i in range(len(rows[0]))]
    if not columns:
        columns = ["(empty)"]

    display_rows: list[list[str]] = []
    for row in rows:
        display_rows.append(
            [_cell_text(row[i]) if i < len(row) else "" for i in range(len(columns))]
        )
    if not display_rows:
        display_rows = [["" for _ in columns]]

    header = [_cell_text(c) for c in columns]
    font = _font(14)
    title_font = _font(16)

    # 用临时图探测文字度量
    probe = Image.new("RGB", (10, 10), _BG)
    draw = ImageDraw.Draw(probe)

    col_widths: list[int] = []
    for i, h in enumerate(header):
        w, _ = _text_size(draw, h, font)
        for row in display_rows:
            cw, _ = _text_size(draw, row[i], font)
            w = max(w, cw)
        col_widths.append(max(_CELL_MIN_W, w + 2 * _PAD_X))

    _, line_h = _text_size(draw, "Ag", font)
    row_h = line_h + 2 * _PAD_Y
    table_w = sum(col_widths) + 1
    table_h = row_h * (1 + len(display_rows)) + 1

    title_h = 0
    title_text = title or ""
    if title_text:
        _, th = _text_size(draw, title_text, title_font)
        title_h = th + 2 * _PAD_Y

    img_w = max(table_w, 120) + 2 * _PAD_X
    img_h = title_h + table_h + 2 * _PAD_Y
    img = Image.new("RGB", (img_w, img_h), _BG)
    draw = ImageDraw.Draw(img)

    y0 = _PAD_Y
    if title_text:
        draw.text((_PAD_X, y0), title_text, fill=_TITLE_FG, font=title_font)
        y0 += title_h

    x0 = _PAD_X
    # 表头背景
    draw.rectangle([x0, y0, x0 + table_w, y0 + row_h], fill=_HEADER_BG)

    # 网格 + 文字
    all_rows = [header] + display_rows
    for r_i, row in enumerate(all_rows):
        y = y0 + r_i * row_h
        x = x0
        for c_i, cell in enumerate(row):
            # 单元格边框
            draw.rectangle(
                [x, y, x + col_widths[c_i], y + row_h],
                outline=_GRID,
                fill=_HEADER_BG if r_i == 0 else None,
            )
            draw.text((x + _PAD_X, y + _PAD_Y), cell, fill=_FG, font=font)
            x += col_widths[c_i]

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class ImageTableRenderer:
    """产出 PNG 表格图的渲染器（``type="image_table"``）。"""

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "image_table"

    def render(
        self,
        result: QueryResult,
        config: dict[str, Any],
        params: dict[str, Any],
    ) -> list[MessagePart]:
        """生成 PNG、落盘，返回 kind=image 且 content 含 path 的片段。"""
        del params
        title = config.get("title")
        if title is not None:
            title = str(title)
        max_rows = int(config.get("max_rows") or 50)
        filename = str(config.get("filename") or "table.png")
        if not filename.lower().endswith(".png"):
            filename = f"{filename}.png"

        png = render_table_png(result, title=title, max_rows=max_rows)
        storage = LocalStorage(config.get("storage_root"))
        path = storage.save_bytes(png, filename)

        content: dict[str, Any] = {"path": path}
        if title:
            content["title"] = title
        return [MessagePart(kind="image", content=content)]
