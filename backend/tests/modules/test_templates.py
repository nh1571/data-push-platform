"""Unit tests for editor image templates."""

from __future__ import annotations

from pathlib import Path

from app.modules.editor.design import build_message_from_design
from app.modules.editor.templates import render_and_save_template, render_template_png
from app.plugins.base import QueryResult


def _result() -> QueryResult:
    return QueryResult(
        columns=["name", "amount", "region"],
        rows=[["Alice", 100, "East"], ["Bob", 200, "West"]],
    )


def test_render_report_v1_not_empty() -> None:
    png = render_template_png(
        _result(),
        {
            "template_id": "report_v1",
            "title": "日报 {{name}}",
            "header_text": "明细",
            "footer_text": "end",
            "theme_color": "#1677ff",
            "show_table": True,
        },
    )
    assert isinstance(png, bytes)
    assert len(png) > 100
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_render_alert_and_kpi() -> None:
    for tid in ("alert_v1", "kpi_v1"):
        png = render_template_png(
            _result(),
            {"template_id": tid, "title": "T", "show_table": True},
        )
        assert len(png) > 100
        assert png[:4] == b"\x89PNG"


def test_render_and_save_writes_file(tmp_path: Path) -> None:
    png, path = render_and_save_template(
        _result(),
        {"template_id": "report_v1", "title": "Save me"},
        filename="unit_test.png",
        storage_root=str(tmp_path),
    )
    assert len(png) > 100
    saved = Path(path)
    assert saved.is_file()
    assert saved.stat().st_size > 100
    assert saved.read_bytes()[:4] == b"\x89PNG"


def test_build_message_image_mode_has_image_part(tmp_path: Path, monkeypatch) -> None:
    from app import config as config_mod

    monkeypatch.setattr(config_mod.settings, "storage_root", str(tmp_path))
    message = build_message_from_design(
        _result(),
        {
            "output_mode": "image",
            "template_id": "report_v1",
            "title": "Img {{name}}",
            "show_table": True,
        },
    )
    kinds = [p.kind for p in message.parts]
    assert "image" in kinds
    image_part = next(p for p in message.parts if p.kind == "image")
    assert isinstance(image_part.content, dict)
    path = Path(image_part.content["path"])
    assert path.is_file()
    assert path.stat().st_size > 0
