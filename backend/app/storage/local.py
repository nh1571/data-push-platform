"""Filesystem storage under ``settings.storage_root``."""

from __future__ import annotations

import re
from pathlib import Path

from app.config import settings

_UNSAFE_CHARS = re.compile(r"[^\w.\-]+", re.UNICODE)


def _safe_filename(filename: str) -> str:
    """Return a basename-safe filename (no path segments)."""
    name = Path(filename).name.strip() or "file.bin"
    # Collapse path-like and odd characters while keeping extension-ish dots.
    cleaned = _UNSAFE_CHARS.sub("_", name).strip("._") or "file.bin"
    return cleaned


class LocalStorage:
    """Save bytes under a root directory (default: ``settings.storage_root``)."""

    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root if root is not None else settings.storage_root).expanduser()

    def ensure_root(self) -> Path:
        """Create the storage root if missing and return it."""
        self.root.mkdir(parents=True, exist_ok=True)
        return self.root

    def save_bytes(self, data: bytes, filename: str) -> str:
        """Write *data* as *filename* under the storage root.

        Returns an absolute path string to the written file. Parent directories
        under the root are created as needed. Filenames are sanitized to a
        single path segment; if the target already exists, a numeric suffix is
        added before the extension.
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
