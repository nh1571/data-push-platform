"""Convert rich-text HTML (Quill) to DingTalk-friendly Markdown."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any


_TAG_RE = re.compile(r"<[a-zA-Z!/]")
_EMPTY_RE = re.compile(r"^(?:\s|&nbsp;|<p><br\s*/?></p>|<p>\s*</p>|<br\s*/?>)*$", re.I)


def looks_like_html(text: str) -> bool:
    if not text or not text.strip():
        return False
    return bool(_TAG_RE.search(text))


def is_empty_rich_text(text: str) -> bool:
    if not text or not str(text).strip():
        return True
    plain = re.sub(r"<[^>]+>", "", str(text))
    plain = plain.replace("\xa0", " ").replace("&nbsp;", " ").strip()
    return not plain


def html_to_dingtalk_md(html: str) -> str:
    """Map common Quill HTML to DingTalk markdown (+ font color).

    DingTalk markdown supports headers, bold, italic, lists, links, and
    ``<font color=#RRGGBB>text</font>`` color tags.
    """
    raw = str(html or "").strip()
    if not raw or is_empty_rich_text(raw):
        return ""
    if not looks_like_html(raw):
        return raw

    parser = _DingMdParser()
    try:
        parser.feed(raw)
        parser.close()
    except Exception:
        # Fallback: strip tags
        plain = re.sub(r"<[^>]+>", "", raw)
        return _unescape(plain).strip()

    text = parser.get_text()
    # Collapse excess blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def rich_to_push_text(content: Any) -> str:
    """Normalize shell field for outbound message parts."""
    raw = str(content or "").strip()
    if not raw or is_empty_rich_text(raw):
        return ""
    if looks_like_html(raw):
        return html_to_dingtalk_md(raw)
    return raw


def _unescape(s: str) -> str:
    return (
        s.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )


def _parse_style_color(style: str) -> str | None:
    if not style:
        return None
    m = re.search(r"color\s*:\s*([^;]+)", style, re.I)
    if not m:
        return None
    color = m.group(1).strip()
    # rgb( r, g, b )
    rgb = re.match(r"rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", color, re.I)
    if rgb:
        r, g, b = (int(rgb.group(1)), int(rgb.group(2)), int(rgb.group(3)))
        return f"#{r:02x}{g:02x}{b:02x}"
    if color.startswith("#"):
        return color
    return color


class _DingMdParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []
        self._list_stack: list[str] = []  # 'ul' | 'ol'
        self._ol_index: list[int] = []
        self._bold = 0
        self._italic = 0
        self._strike = 0
        self._link_href: str | None = None
        self._color_stack: list[str] = []
        self._pending_block = False

    def get_text(self) -> str:
        return "".join(self._chunks)

    def _emit(self, s: str) -> None:
        if not s:
            return
        self._chunks.append(s)

    def _open_inline_wrappers(self) -> str:
        parts: list[str] = []
        if self._color_stack:
            parts.append(f"<font color={self._color_stack[-1]}>")
        if self._bold:
            parts.append("**")
        if self._italic:
            parts.append("*")
        if self._strike:
            parts.append("~~")
        return "".join(parts)

    def _close_inline_wrappers(self) -> str:
        parts: list[str] = []
        if self._strike:
            parts.append("~~")
        if self._italic:
            parts.append("*")
        if self._bold:
            parts.append("**")
        if self._color_stack:
            parts.append("</font>")
        return "".join(parts)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = tag.lower()
        ad = {k.lower(): (v or "") for k, v in attrs}

        if t in ("p", "div"):
            if self._chunks and not self._chunks[-1].endswith("\n"):
                self._emit("\n")
            return
        if t == "br":
            self._emit("\n")
            return
        if t in ("h1", "h2", "h3", "h4"):
            if self._chunks and not self._chunks[-1].endswith("\n"):
                self._emit("\n")
            level = int(t[1])
            self._emit("#" * min(level, 3) + " ")
            return
        if t in ("strong", "b"):
            self._bold += 1
            return
        if t in ("em", "i"):
            self._italic += 1
            return
        if t in ("s", "strike", "del"):
            self._strike += 1
            return
        if t == "a":
            self._link_href = ad.get("href") or ""
            return
        if t == "ul":
            self._list_stack.append("ul")
            return
        if t == "ol":
            self._list_stack.append("ol")
            self._ol_index.append(0)
            return
        if t == "li":
            if self._chunks and not self._chunks[-1].endswith("\n"):
                self._emit("\n")
            if self._list_stack and self._list_stack[-1] == "ol":
                if self._ol_index:
                    self._ol_index[-1] += 1
                    self._emit(f"{self._ol_index[-1]}. ")
                else:
                    self._emit("1. ")
            else:
                self._emit("- ")
            return
        if t == "blockquote":
            if self._chunks and not self._chunks[-1].endswith("\n"):
                self._emit("\n")
            self._emit("> ")
            return
        if t in ("span", "font"):
            color = ad.get("color") or _parse_style_color(ad.get("style") or "")
            if color:
                self._color_stack.append(color)
            # quill may set font-weight in style
            style = ad.get("style") or ""
            if "bold" in style or "font-weight:700" in style.replace(" ", ""):
                self._bold += 1
            return

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if t in ("p", "div"):
            self._emit("\n")
            return
        if t in ("h1", "h2", "h3", "h4"):
            self._emit("\n")
            return
        if t in ("strong", "b"):
            self._bold = max(0, self._bold - 1)
            return
        if t in ("em", "i"):
            self._italic = max(0, self._italic - 1)
            return
        if t in ("s", "strike", "del"):
            self._strike = max(0, self._strike - 1)
            return
        if t == "a":
            # text already emitted; wrap was not applied — fix in handle_data
            self._link_href = None
            return
        if t == "ul":
            if self._list_stack and self._list_stack[-1] == "ul":
                self._list_stack.pop()
            self._emit("\n")
            return
        if t == "ol":
            if self._list_stack and self._list_stack[-1] == "ol":
                self._list_stack.pop()
            if self._ol_index:
                self._ol_index.pop()
            self._emit("\n")
            return
        if t == "li":
            self._emit("\n")
            return
        if t == "blockquote":
            self._emit("\n")
            return
        if t in ("span", "font"):
            if self._color_stack:
                self._color_stack.pop()
            return

    def handle_data(self, data: str) -> None:
        if not data:
            return
        # Preserve internal spaces; collapse pure whitespace runs lightly
        text = data.replace("\xa0", " ")
        if not text.strip() and "\n" not in text:
            # keep single spaces between words
            if text:
                self._emit(" ")
            return

        open_w = self._open_inline_wrappers()
        close_w = self._close_inline_wrappers()
        body = text
        if self._link_href:
            body = f"[{text}]({self._link_href})"
            # link replaces bold wrappers order for simplicity
            self._emit(open_w + body + close_w)
        else:
            self._emit(open_w + body + close_w)
