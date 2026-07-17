"""基于本地文件系统的产物存储，根目录默认为 ``settings.storage_root``。

供渲染器（图片表、CSV/XLSX 导出等）落盘使用；返回绝对路径字符串，
便于通道插件在消息中引用或上传 media。
"""

from __future__ import annotations

import re
from pathlib import Path

from app.config import settings

# 仅保留字母数字、下划线、点、连字符；其余替换为下划线，防止路径穿越
_UNSAFE_CHARS = re.compile(r"[^\w.\-]+", re.UNICODE)


def _safe_filename(filename: str) -> str:
    """返回仅含单段路径的安全文件名（剥离目录成分）。"""
    name = Path(filename).name.strip() or "file.bin"
    # 折叠路径类与异常字符，同时尽量保留扩展名中的点
    cleaned = _UNSAFE_CHARS.sub("_", name).strip("._") or "file.bin"
    return cleaned


class LocalStorage:
    """将字节写入根目录下的本地存储（默认：``settings.storage_root``）。"""

    def __init__(self, root: str | Path | None = None) -> None:
        """初始化存储根路径；*root* 为 None 时使用配置中的 storage_root。"""
        self.root = Path(root if root is not None else settings.storage_root).expanduser()

    def ensure_root(self) -> Path:
        """若根目录不存在则创建，并返回 Path。"""
        self.root.mkdir(parents=True, exist_ok=True)
        return self.root

    def save_bytes(self, data: bytes, filename: str) -> str:
        """将 *data* 以 *filename* 写入存储根目录。

        返回已写入文件的绝对路径字符串。会按需创建根下父目录；
        文件名经安全化处理为单段路径；若目标已存在，则在扩展名前追加数字后缀。
        """
        root = self.ensure_root()
        safe = _safe_filename(filename)
        dest = root / safe
        if dest.exists():
            stem = dest.stem
            suffix = dest.suffix
            n = 1
            while True:
                candidate = root / f"{stem}_{n}{suffix}"
                if not candidate.exists():
                    dest = candidate
                    break
                n += 1
        dest.write_bytes(data)
        return str(dest.resolve())
