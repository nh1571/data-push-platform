"""LocalStorage unit tests."""

from __future__ import annotations

from pathlib import Path

from app.storage.local import LocalStorage


def test_save_bytes_creates_file(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    path = storage.save_bytes(b"hello", "a.txt")
    p = Path(path)
    assert p.is_absolute()
    assert p.exists()
    assert p.read_bytes() == b"hello"
    assert p.parent == tmp_path.resolve()


def test_save_bytes_unique_on_collision(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    p1 = Path(storage.save_bytes(b"1", "same.bin"))
    p2 = Path(storage.save_bytes(b"2", "same.bin"))
    assert p1 != p2
    assert p1.read_bytes() == b"1"
    assert p2.read_bytes() == b"2"


def test_sanitizes_path_segments(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    path = Path(storage.save_bytes(b"x", "../../evil.txt"))
    assert path.parent == tmp_path.resolve()
    assert path.name == "evil.txt"
