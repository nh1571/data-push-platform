"""file_export renderer unit tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.plugins.base import QueryResult
from app.plugins.renderer.file_export import (
    FileExportRenderer,
    export_csv_bytes,
    export_xlsx_bytes,
)


def test_export_csv_bytes() -> None:
    result = QueryResult(columns=["id", "name"], rows=[[1, "a"], [2, "b"]])
    data = export_csv_bytes(result)
    text = data.decode("utf-8-sig")
    assert "id,name" in text
    assert "1,a" in text


def test_export_xlsx_bytes() -> None:
    result = QueryResult(columns=["id", "name"], rows=[[1, "a"]])
    data = export_xlsx_bytes(result)
    assert data[:2] == b"PK"  # zip/xlsx magic


def test_plugin_csv(tmp_path: Path) -> None:
    plugin = FileExportRenderer()
    assert plugin.type == "file_export"
    parts = plugin.render(
        QueryResult(columns=["x"], rows=[[1]]),
        {"format": "csv", "filename": "out.csv", "storage_root": str(tmp_path)},
        {},
    )
    assert len(parts) == 1
    assert parts[0].kind == "file"
    content = parts[0].content
    assert content["format"] == "csv"
    path = Path(content["path"])
    assert path.exists()
    assert "1" in path.read_text(encoding="utf-8-sig")


def test_plugin_xlsx(tmp_path: Path) -> None:
    plugin = FileExportRenderer()
    parts = plugin.render(
        QueryResult(columns=["x"], rows=[[42]]),
        {"format": "xlsx", "storage_root": str(tmp_path)},
        {},
    )
    assert parts[0].kind == "file"
    path = Path(parts[0].content["path"])
    assert path.exists()
    assert path.suffix == ".xlsx"
    assert path.read_bytes()[:2] == b"PK"


def test_unsupported_format() -> None:
    plugin = FileExportRenderer()
    with pytest.raises(ValueError, match="unsupported"):
        plugin.render(
            QueryResult(columns=["x"], rows=[]),
            {"format": "pdf"},
            {},
        )
