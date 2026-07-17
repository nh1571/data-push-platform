"""推送编辑器 PNG 图片模板（report / alert / kpi）。

用 Pillow 将 QueryResult + design 渲成 PNG 字节，可选经 LocalStorage 落盘。
"""

from __future__ import annotations

from io import BytesIO
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from app.plugins.base import QueryResult
from app.storage.local import LocalStorage

_PAD = 16
_MAX_CELL_CHARS = 36
_MAX_ROWS = 40
_BG = (255, 255, 255)
_FG = (30, 30, 30)
_MUTED = (100, 100, 100)
_HEADER_BG = (245, 247, 250)
_GRID = (210, 210, 210)
_WHITE = (255, 255, 255)
# 百分比着色与旧版 pythonProject4 表格样式对齐
_RATIO_STRONG_POS = (0, 87, 55)  # #005737 >= 20%
_RATIO_POS = (0, 176, 80)  # #00B050 0~20%
_RATIO_NEG = (255, 0, 0)  # #FF0000 < 0
_RATIO_STRONG_NEG = (144, 0, 0)  # #900000 <= -20%

TEMPLATE_IDS = frozenset({"report_v1", "alert_v1", "kpi_v1"})

_PERCENT_RE = __import__("re").compile(
    r"^\s*([+-]?\d+(?:\.\d+)?)\s*%\s*$"
)


def _font(size: int = 14) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    """按候选路径加载 TrueType 字体，失败则默认字体。"""
    candidates = (
        "DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    """测量文本宽高。"""
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def _cell_text(value: Any) -> str:
    """单元格展示文本（截断超长）。"""
    if value is None:
        return ""
    text = str(value).replace("\n", " ")
    if len(text) > _MAX_CELL_CHARS:
        return text[: _MAX_CELL_CHARS - 1] + "…"
    return text


def _ratio_text_color(cell: str, *, enabled: bool) -> tuple[int, int, int]:
    """百分比类单元格文字色（旧版红绿规则）。"""
    if not enabled:
        return _FG
    m = _PERCENT_RE.match(cell)
    if not m:
        # 也接受已是 0–100 量级的裸浮点
        try:
            if cell.strip().endswith("%"):
                return _FG
            val = float(cell.replace(",", ""))
            # 仅在常见百分比范围内着色
            if abs(val) > 200:
                return _FG
            pct = val
        except ValueError:
            return _FG
    else:
        pct = float(m.group(1))
    if pct >= 20:
        return _RATIO_STRONG_POS
    if pct > 0:
        return _RATIO_POS
    if pct <= -20:
        return _RATIO_STRONG_NEG
    if pct < 0:
        return _RATIO_NEG
    return _FG


def _parse_hex_color(value: str | None, default: tuple[int, int, int] = (22, 119, 255)) -> tuple[int, int, int]:
    """解析 #RGB/#RRGGBB 为 RGB 元组。"""
    if not value:
        return default
    s = str(value).strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        return default
    try:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except ValueError:
        return default


def _substitute_title(title: str | None, result: QueryResult) -> str:
    """标题/页眉页脚做首行占位符替换。"""
    from app.modules.editor.design import substitute_first_row

    if not title:
        return ""
    return substitute_first_row(str(title), result)


def _display_table(
    result: QueryResult,
    *,
    max_rows: int = _MAX_ROWS,
) -> tuple[list[str], list[list[str]]]:
    """准备表头与展示行（截断单元格与行数）。"""
    columns = list(result.columns or [])
    rows = list(result.rows or [])[: max(0, max_rows)]
    if not columns and rows:
        columns = [f"col_{i}" for i in range(len(rows[0]))]
    if not columns:
        columns = ["(empty)"]
    display: list[list[str]] = []
    for row in rows:
        display.append(
            [_cell_text(row[i]) if i < len(row) else "" for i in range(len(columns))]
        )
    if not display:
        display = [["" for _ in columns]]
    return [_cell_text(c) for c in columns], display


def _draw_table(
    draw: ImageDraw.ImageDraw,
    *,
    x0: int,
    y0: int,
    header: list[str],
    rows: list[list[str]],
    font: ImageFont.ImageFont,
    max_width: int,
    color_ratios: bool = True,
) -> int:
    """绘制简易表格，返回占用高度。

    *color_ratios* 为真时，百分比单元格使用旧版红绿文字色。
    """
    probe = draw
    col_n = len(header)
    if col_n == 0:
        return 0

    col_widths: list[int] = []
    for i, h in enumerate(header):
        w, _ = _text_size(probe, h, font)
        for row in rows:
            if i < len(row):
                cw, _ = _text_size(probe, row[i], font)
                w = max(w, cw)
        col_widths.append(max(48, w + 16))

    total_w = sum(col_widths) + 1
    if total_w > max_width and total_w > 0:
        scale = max_width / total_w
        col_widths = [max(40, int(w * scale)) for w in col_widths]
        total_w = sum(col_widths) + 1

    _, line_h = _text_size(probe, "Ag", font)
    row_h = line_h + 12
    all_rows = [header] + rows

    for r_i, row in enumerate(all_rows):
        y = y0 + r_i * row_h
        x = x0
        for c_i in range(col_n):
            cell = row[c_i] if c_i < len(row) else ""
            fill = _HEADER_BG if r_i == 0 else None
            draw.rectangle(
                [x, y, x + col_widths[c_i], y + row_h],
                outline=_GRID,
                fill=fill,
            )
            text_fill = (
                _FG
                if r_i == 0
                else _ratio_text_color(cell, enabled=color_ratios)
            )
            draw.text((x + 8, y + 6), cell, fill=text_fill, font=font)
            x += col_widths[c_i]

    return row_h * len(all_rows) + 1


def render_template_png(result: QueryResult, design: dict[str, Any] | None) -> bytes:
    """将 *result* 按 *design* 渲成 PNG 字节。"""
    design = dict(design or {})
    template_id = str(design.get("template_id") or "report_v1")
    if template_id not in TEMPLATE_IDS:
        template_id = "report_v1"

    theme = _parse_hex_color(design.get("theme_color") if isinstance(design.get("theme_color"), str) else None)
    if template_id == "alert_v1" and not design.get("theme_color"):
        theme = (255, 77, 79)  # 告警默认红色

    title = _substitute_title(design.get("title") or design.get("header_text"), result)
    header_text = _substitute_title(design.get("header_text"), result) if design.get("title") else ""
    if not title and design.get("header_text"):
        title = _substitute_title(design.get("header_text"), result)
        header_text = ""
    footer_text = _substitute_title(design.get("footer_text"), result)
    show_table = design.get("show_table", True)
    if show_table is None:
        show_table = True
    color_ratios = design.get("color_ratios", True)
    if color_ratios is None:
        color_ratios = True

    title_font = _font(22)
    body_font = _font(14)
    kpi_font = _font(36)
    label_font = _font(13)
    footer_font = _font(12)

    # 预估画布尺寸
    img_w = 720
    content_w = img_w - 2 * _PAD

    # 预测量表格高度
    header, display_rows = _display_table(result)
    probe_img = Image.new("RGB", (10, 10), _BG)
    probe_draw = ImageDraw.Draw(probe_img)

    header_bar_h = 56
    y_cursor = header_bar_h + _PAD

    if template_id == "kpi_v1":
        y_cursor += 120  # KPI 行高估算
        if header_text:
            _, hh = _text_size(probe_draw, header_text or " ", body_font)
            y_cursor += hh + 12
    else:
        if header_text and header_text != title:
            _, hh = _text_size(probe_draw, header_text or " ", body_font)
            y_cursor += hh + 12
        if show_table:
            # 近似表高
            _, line_h = _text_size(probe_draw, "Ag", body_font)
            y_cursor += (line_h + 12) * (1 + len(display_rows)) + 8

    if footer_text:
        _, fh = _text_size(probe_draw, footer_text or " ", footer_font)
        y_cursor += fh + _PAD
    else:
        y_cursor += _PAD

    img_h = max(y_cursor + _PAD, 200)
    img = Image.new("RGB", (img_w, img_h), _BG)
    draw = ImageDraw.Draw(img)

    # 顶栏
    bar_label = title or ("告警" if template_id == "alert_v1" else "数据报告")
    if template_id == "alert_v1" and not design.get("title"):
        bar_label = title or "告警"
    draw.rectangle([0, 0, img_w, header_bar_h], fill=theme)
    draw.text((_PAD, 16), bar_label[:80], fill=_WHITE, font=title_font)

    y = header_bar_h + _PAD

    if template_id == "kpi_v1":
        # 从首行最多取 3 个 KPI 列
        cols = list(result.columns or [])
        kpi_cols = design.get("kpi_columns") or []
        if isinstance(kpi_cols, list) and kpi_cols:
            selected = [str(c) for c in kpi_cols if str(c) in cols][:3]
        else:
            selected = cols[:3]
        first = list(result.rows[0]) if result.rows else []
        col_index = {name: i for i, name in enumerate(cols)}

        slot_w = content_w // max(len(selected), 1)
        for i, col_name in enumerate(selected or ["—"]):
            idx = col_index.get(col_name)
            value = ""
            if idx is not None and idx < len(first) and first[idx] is not None:
                value = str(first[idx])
            elif not selected:
                value = "—"
            cx = _PAD + i * slot_w
            draw.text((cx, y), col_name[:24], fill=_MUTED, font=label_font)
            draw.text((cx, y + 22), (value or "—")[:20], fill=theme, font=kpi_font)
        y += 100

        if header_text:
            draw.text((_PAD, y), header_text[:200], fill=_FG, font=body_font)
            _, hh = _text_size(draw, header_text[:200] or " ", body_font)
            y += hh + 12
        if show_table and cols:
            th = _draw_table(
                draw,
                x0=_PAD,
                y0=y,
                header=header,
                rows=display_rows,
                font=body_font,
                max_width=content_w,
                color_ratios=bool(color_ratios),
            )
            y += th + 8
    else:
        # report_v1 / alert_v1 模板
        if template_id == "alert_v1" and not title:
            draw.text((_PAD, y), "告警通知", fill=_FG, font=body_font)
            y += 28
        if header_text and header_text != bar_label:
            draw.text((_PAD, y), header_text[:240], fill=_FG, font=body_font)
            _, hh = _text_size(draw, header_text[:240] or " ", body_font)
            y += hh + 12
        if show_table:
            th = _draw_table(
                draw,
                x0=_PAD,
                y0=y,
                header=header,
                rows=display_rows,
                font=body_font,
                max_width=content_w,
                color_ratios=bool(color_ratios),
            )
            y += th + 8

    if footer_text:
        draw.text((_PAD, y + 4), footer_text[:200], fill=_MUTED, font=footer_font)

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def render_and_save_template(
    result: QueryResult,
    design: dict[str, Any] | None,
    *,
    filename: str = "push_template.png",
    storage_root: str | None = None,
) -> tuple[bytes, str]:
    """渲染模板 PNG 并写入本地存储。返回 (bytes, path)。"""
    png = render_template_png(result, design)
    if not filename.lower().endswith(".png"):
        filename = f"{filename}.png"
    storage = LocalStorage(storage_root)
    path = storage.save_bytes(png, filename)
    return png, path
