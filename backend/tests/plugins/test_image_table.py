"""image_table renderer unit tests."""

from __future__ import annotations

from pathlib import Path

from app.plugins.base import QueryResult
from app.plugins.renderer.image_table import ImageTableRenderer, render_table_png


def test_render_table_png_bytes() -> None:
    result = QueryResult(columns=["id", "name"], rows=[[1, "a"], [2, "b"]])
    png = render_table_png(result, title="Demo")
    assert isinstance(png, bytes)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_plugin_saves_image_part(tmp_path: Path) -> None:
    plugin = ImageTableRenderer()
    assert plugin.type == "image_table"
    parts = plugin.render(
        QueryResult(columns=["x", "y"], rows=[[1, 2]]),
        {"title": "T", "filename": "demo.png", "storage_root": str(tmp_path)},
        {},
    )
    assert len(parts) == 1
    assert parts[0].kind == "image"
    content = parts[0].content
    assert isinstance(content, dict)
    path = Path(content["path"])
    assert path.exists()
    assert path.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    assert content.get("title") == "T"


def test_empty_result_still_png(tmp_path: Path) -> None:
    plugin = ImageTableRenderer()
    parts = plugin.render(
        QueryResult(columns=[], rows=[]),
        {"storage_root": str(tmp_path), "filename": "empty.png"},
        {},
    )
    assert parts[0].kind == "image"
    assert Path(parts[0].content["path"]).exists()
