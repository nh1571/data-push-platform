"""文件导出渲染器（``type="file_export"``）。

将 :class:`~app.plugins.base.QueryResult` 写入本地存储为 CSV 或 XLSX，
返回 ``kind="file"`` 的 :class:`~app.plugins.base.MessagePart`，content 含 ``path``。

**通道说明（钉钉 Webhook）：** 机器人 Webhook 通常无法上传二进制附件。
钉钉通道在遇到 ``file`` 片段时会将保存路径（或 download URL）以纯文本追加，
便于收件人从共享存储或后续下载链接取回产物。

配置键：

- ``format``: ``csv``（默认）或 ``xlsx``
- ``filename``: 可选 basename（默认 ``export.csv`` / ``export.xlsx``）
- ``storage_root``: 覆盖本地存储根目录
"""

from __future__ import annotations

import csv
import io
from typing import Any

from app.plugins.base import MessagePart, QueryResult
from app.storage.local import LocalStorage


def _normalize_format(fmt: Any) -> str:
    """规范化 format 字符串；非法值抛 ValueError。"""
    value = str(fmt or "csv").lower().strip()
    if value in ("csv", "xlsx"):
        return value
    raise ValueError(f"unsupported file_export format: {fmt!r}; expected 'csv' or 'xlsx'")


def export_csv_bytes(result: QueryResult) -> bytes:
    """将 *result* 序列化为 UTF-8 CSV 字节（带 BOM，便于 Excel 打开中文）。"""
    columns = list(result.columns or [])
    rows = list(result.rows or [])
    if not columns and rows:
        columns = [f"col_{i}" for i in range(len(rows[0]))]

    buf = io.StringIO()
    writer = csv.writer(buf)
    if columns:
        writer.writerow(columns)
    for row in rows:
        cells = [row[i] if i < len(row) else "" for i in range(len(columns) or len(row))]
        writer.writerow(cells)
    # UTF-8 BOM 帮助 Excel 正确打开中文 CSV
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def export_xlsx_bytes(result: QueryResult) -> bytes:
    """将 *result* 序列化为内存中的 XLSX 工作簿字节。"""
    from openpyxl import Workbook

    columns = list(result.columns or [])
    rows = list(result.rows or [])
    if not columns and rows:
        columns = [f"col_{i}" for i in range(len(rows[0]))]

    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "data"
    if columns:
        ws.append(columns)
    for row in rows:
        cells = [row[i] if i < len(row) else None for i in range(len(columns) or len(row))]
        ws.append(cells)

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


class FileExportRenderer:
    """将 QueryResult 导出为文件的渲染器（``type="file_export"``）。"""

    @property
    def type(self) -> str:
        """插件类型标识。"""
        return "file_export"

    def render(
        self,
        result: QueryResult,
        config: dict[str, Any],
        params: dict[str, Any],
    ) -> list[MessagePart]:
        """按 format 导出并落盘，返回 kind=file 的 MessagePart。"""
        del params
        fmt = _normalize_format(config.get("format"))
        default_name = f"export.{fmt}"
        filename = str(config.get("filename") or default_name)
        # 确保扩展名与 format 一致
        lower = filename.lower()
        if fmt == "csv" and not lower.endswith(".csv"):
            filename = f"{filename}.csv"
        elif fmt == "xlsx" and not lower.endswith(".xlsx"):
            filename = f"{filename}.xlsx"

        if fmt == "csv":
            data = export_csv_bytes(result)
        else:
            data = export_xlsx_bytes(result)

        storage = LocalStorage(config.get("storage_root"))
        path = storage.save_bytes(data, filename)

        content: dict[str, Any] = {
            "path": path,
            "format": fmt,
            "filename": filename,
        }
        return [MessagePart(kind="file", content=content)]
