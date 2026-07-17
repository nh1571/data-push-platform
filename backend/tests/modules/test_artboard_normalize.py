"""Artboard 归一化契约测试（P0）。"""

from __future__ import annotations

from app.modules.studio.normalize import ARTBOARD_VERSION, normalize_artboard_doc
from app.modules.studio.service import ensure_artboard_doc


def test_normalize_upgrades_tree_only_doc() -> None:
    raw = {
        "tree": {
            "id": "root",
            "type": "Container",
            "children": [
                {"id": "k1", "type": "Kpi", "props": {"label": "门诊"}, "binding": {}},
            ],
        },
        "compose": {"mode": "image_primary", "text_before": "前", "text_after": "后"},
    }
    doc = normalize_artboard_doc(raw)
    assert doc["version"] >= ARTBOARD_VERSION
    assert doc["kind"] == "artboard"
    assert len(doc["canvases"]) == 1
    assert len(doc["library"]) == 1
    assert doc["library"][0]["id"] == "k1"
    segs = doc["compose"]["segments"]
    assert any(s.get("type") == "canvas" for s in segs)
    assert segs[0]["type"] == "text"
    assert segs[-1]["type"] == "text"


def test_normalize_idempotent() -> None:
    raw = {
        "version": 3,
        "kind": "artboard",
        "canvases": [
            {
                "id": "c1",
                "name": "A",
                "tree": {"id": "root", "type": "Container", "children": []},
            }
        ],
        "compose": {
            "segments": [
                {"id": "t1", "type": "text", "html": "x"},
                {"id": "g1", "type": "canvas", "canvas_id": "c1"},
                {"id": "t2", "type": "text", "html": "y"},
            ]
        },
    }
    a = normalize_artboard_doc(raw)
    b = normalize_artboard_doc(a)
    assert a["version"] == b["version"]
    assert len(a["canvases"]) == len(b["canvases"])
    assert len(a["compose"]["segments"]) == len(b["compose"]["segments"])


def test_ensure_artboard_doc_normalizes() -> None:
    doc = ensure_artboard_doc(
        {"tree": {"id": "root", "type": "Container", "children": []}},
        data_source_id="ds1",
        sql="SELECT 1",
    )
    assert doc["version"] == ARTBOARD_VERSION
    assert doc["datasets"][0]["data_source_id"] == "ds1"
    assert doc["datasets"][0]["sql"] == "SELECT 1"
    assert doc["canvases"]
