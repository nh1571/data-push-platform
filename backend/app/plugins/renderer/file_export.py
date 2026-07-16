"""File export renderer (``type="file_export"``).

Writes a :class:`~app.plugins.base.QueryResult` to local storage as CSV or
XLSX and returns a :class:`~app.plugins.base.MessagePart` with ``kind="file"``
and a ``path`` field in content.

**Channel notes (DingTalk webhooks):** robot webhooks typically cannot upload
binary file attachments. The DingTalk channel therefore appends the saved
file path (or download URL if provided) as plain text when ``file`` parts are
present, so recipients can retrieve the artifact from shared storage or a
follow-up download link.

Config keys:

- ``format``: ``csv`` (default) or ``xlsx``
- ``filename``: optional basename (default ``export.csv`` / ``export.xlsx``)
- ``storage_root``: override local storage root
"""

from __future__ import annotations

import csv
import io
from typing import Any

from app.plugins.base import MessagePart, QueryResult
from app.storage.local import LocalStorage


def _normalize_format(fmt: Any) -> str:
    value = str(fmt or "csv").lower().strip()
    if value in ("csv", "xlsx"):
        return value
    raise ValueError(f"unsupported file_export format: {fmt!r}; expected 'csv' or 'xlsx'")


def export_csv_bytes(result: QueryResult) -> bytes:
    """Serialize *result* to UTF-8 CSV bytes (with BOM for Excel compatibility)."""
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
    # UTF-8 BOM helps Excel open Chinese CSV correctly
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def export_xlsx_bytes(result: QueryResult) -> bytes:
    """Serialize *result* to an in-memory XLSX workbook."""
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
    """RendererPlugin that exports QueryResult to a file (``type="file_export"``)."""

    @property
    def type(self) -> str:
        return "file_export"

    def render(
        self,
        result: QueryResult,
        config: dict[str, Any],
        params: dict[str, Any],
    ) -> list[MessagePart]:
        del params
        fmt = _normalize_format(config.get("format"))
        default_name = f"export.{fmt}"
        filename = str(config.get("filename") or default_name)
        # Ensure extension matches format
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
