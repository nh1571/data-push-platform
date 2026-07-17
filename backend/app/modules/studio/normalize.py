"""Artboard 文档归一化（v3）。

加载 / 编译 / 保存前统一调用，保证：
- version/kind
- canvases（兼容仅 tree）
- library（从画布收集）
- compose.segments（兼容 text_before/after）
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

ARTBOARD_VERSION = 3


def _nid() -> str:
    return uuid4().hex[:12]


def _empty_tree() -> dict[str, Any]:
    return {
        "id": "root",
        "type": "Container",
        "props": {"direction": "column", "gap": 12},
        "children": [],
        "binding": {},
    }


def list_canvases(doc: dict[str, Any]) -> list[dict[str, Any]]:
    """列出画布；无 canvases 时从 tree 升为单画布。"""
    raw = doc.get("canvases")
    if isinstance(raw, list) and raw:
        out: list[dict[str, Any]] = []
        for i, c in enumerate(raw):
            if not isinstance(c, dict):
                continue
            tree = c.get("tree") if isinstance(c.get("tree"), dict) else _empty_tree()
            out.append(
                {
                    **c,
                    "id": str(c.get("id") or f"canvas_{i}"),
                    "name": str(c.get("name") or f"画布 {i + 1}"),
                    "width": int(c.get("width") or (doc.get("artboard") or {}).get("width") or 750),
                    "tree": tree,
                }
            )
        if out:
            return out
    tree = doc.get("tree") if isinstance(doc.get("tree"), dict) else _empty_tree()
    ab = dict(doc.get("artboard") or {})
    return [
        {
            "id": "canvas_main",
            "name": "画布 1",
            "width": int(ab.get("width") or 750),
            "show_chrome": ab.get("show_chrome"),
            "chrome_title": ab.get("chrome_title"),
            "theme": ab.get("theme"),
            "tree": tree,
        }
    ]


def harvest_library(doc: dict[str, Any], canvases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """组件库：已有 library 优先，否则从各画布 children 去重收集。"""
    lib = doc.get("library")
    if isinstance(lib, list) and lib:
        return [dict(n) for n in lib if isinstance(n, dict)]
    seen: dict[str, dict[str, Any]] = {}
    for c in canvases:
        tree = c.get("tree") if isinstance(c.get("tree"), dict) else {}
        for ch in tree.get("children") or []:
            if not isinstance(ch, dict):
                continue
            cid = str(ch.get("id") or "")
            if cid and cid not in seen:
                seen[cid] = dict(ch)
    return list(seen.values())


def _default_segments(
    canvases: list[dict[str, Any]],
    compose: dict[str, Any],
) -> list[dict[str, Any]]:
    segs: list[dict[str, Any]] = [
        {"id": f"seg_{_nid()}", "type": "text", "html": compose.get("text_before") or ""},
    ]
    for c in canvases:
        segs.append(
            {
                "id": f"seg_{_nid()}",
                "type": "canvas",
                "canvas_id": c.get("id"),
            }
        )
    segs.append(
        {"id": f"seg_{_nid()}", "type": "text", "html": compose.get("text_after") or ""},
    )
    return segs


def _normalize_segments(
    compose: dict[str, Any],
    canvases: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    raw = compose.get("segments")
    ids = {str(c.get("id")) for c in canvases}
    if isinstance(raw, list) and raw:
        out: list[dict[str, Any]] = []
        for s in raw:
            if not isinstance(s, dict):
                continue
            st = str(s.get("type") or "")
            if st == "text":
                out.append(s)
            elif st == "canvas" and str(s.get("canvas_id") or "") in ids:
                out.append(s)
        present = {
            str(s.get("canvas_id"))
            for s in out
            if str(s.get("type")) == "canvas"
        }
        for c in canvases:
            cid = str(c.get("id"))
            if cid not in present:
                # 插在最后一个 text 前
                last_text = -1
                for i in range(len(out) - 1, -1, -1):
                    if str(out[i].get("type")) == "text":
                        last_text = i
                        break
                seg = {"id": f"seg_{_nid()}", "type": "canvas", "canvas_id": cid}
                if last_text > 0:
                    out = out[:last_text] + [seg] + out[last_text:]
                else:
                    out.append(seg)
        if out:
            return out
    return _default_segments(canvases, compose)


def normalize_artboard_doc(doc: dict[str, Any] | None) -> dict[str, Any]:
    """归一化 artboard 文档（幂等）。"""
    doc = dict(doc or {})
    canvases = list_canvases(doc)
    library = harvest_library(doc, canvases)
    compose = dict(doc.get("compose") or {})
    segments = _normalize_segments(compose, canvases)

    # 兼容 text_before/after 与 segments 首尾文案
    texts = [s for s in segments if str(s.get("type")) == "text"]
    if texts:
        compose["text_before"] = texts[0].get("html") or compose.get("text_before") or ""
        if len(texts) > 1:
            compose["text_after"] = texts[-1].get("html") or compose.get("text_after") or ""
    compose["segments"] = segments
    compose["text_format"] = compose.get("text_format") or "html"
    compose["mode"] = compose.get("mode") or "image_primary"

    first = canvases[0]
    artboard = dict(doc.get("artboard") or {})
    artboard.setdefault("width", first.get("width") or 750)
    if first.get("show_chrome") is not None:
        artboard["show_chrome"] = first.get("show_chrome")
    if first.get("chrome_title"):
        artboard["chrome_title"] = first.get("chrome_title")
    if first.get("theme"):
        artboard["theme"] = first.get("theme")

    return {
        **doc,
        "version": max(int(doc.get("version") or 0), ARTBOARD_VERSION),
        "kind": doc.get("kind") or "artboard",
        "artboard": artboard,
        "datasets": list(doc.get("datasets") or [])
        or [{"id": "main", "name": "主查询", "data_source_id": None, "sql": "SELECT 1 AS demo"}],
        "library": library,
        "canvases": canvases,
        "tree": first.get("tree") or doc.get("tree") or _empty_tree(),
        "compose": compose,
    }
