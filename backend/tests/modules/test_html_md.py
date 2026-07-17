"""HTML → DingTalk markdown conversion for push shell text."""

from __future__ import annotations

from app.modules.studio.html_md import (
    html_to_dingtalk_md,
    is_empty_rich_text,
    rich_to_push_text,
)


def test_bold_and_paragraphs() -> None:
    html = "<p><strong>【院区】日报</strong></p><p>以下指标：</p>"
    md = html_to_dingtalk_md(html)
    assert "**【院区】日报**" in md
    assert "以下指标" in md


def test_headers_and_lists() -> None:
    html = "<h2>标题</h2><ul><li>一项</li><li>二项</li></ul>"
    md = html_to_dingtalk_md(html)
    assert "## 标题" in md
    assert "- 一项" in md
    assert "- 二项" in md


def test_color_font_tag() -> None:
    html = '<p><span style="color: rgb(255, 77, 79);">红色</span>普通</p>'
    md = html_to_dingtalk_md(html)
    assert "<font color=#ff4d4f>红色</font>" in md
    assert "普通" in md


def test_link() -> None:
    html = '<p><a href="https://example.com">链接</a></p>'
    md = html_to_dingtalk_md(html)
    assert "[链接](https://example.com)" in md


def test_empty_quill_shell() -> None:
    assert is_empty_rich_text("<p><br></p>")
    assert html_to_dingtalk_md("<p><br></p>") == ""


def test_plain_markdown_passthrough() -> None:
    assert rich_to_push_text("**plain**") == "**plain**"


def test_field_token_survives_conversion() -> None:
    # substitution happens before conversion in compile; converter keeps tokens
    md = html_to_dingtalk_md("<p><strong>Hi {{院区}}</strong></p>")
    assert "{{院区}}" in md
    assert "**Hi {{院区}}**" in md
