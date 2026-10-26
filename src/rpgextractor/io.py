from __future__ import annotations
import hashlib
import json
import os
import shutil
from pathlib import Path
from typing import Callable

class Cancelled(Exception):
    pass

class UnsafePath(ValueError):
    pass

def reject_links(path: Path) -> None:
    """Also reject Windows junctions/reparse points, including ancestors."""
    p = Path(path)
    if not p.is_absolute():
        p = Path.cwd() / p
    for part in [p, *p.parents]:
        if part.is_symlink() or (part.exists() and getattr(part.lstat(), "st_file_attributes", 0) & 0x400):
            raise UnsafePath(f"링크/재분석 경로는 처리하지 않습니다: {part}")

def inside(path: Path, parent: Path) -> bool:
    return path == parent or parent in path.parents

def safe_files(root: Path, exclude: tuple[Path, ...] = (), issue: Callable | None = None):
    reject_links(root)
    def err(error):
        if issue:
            issue("unreadable_path", str(error.filename), "폴더 읽기 권한을 확인하세요.")
    for base, dirs, files in os.walk(root, followlinks=False, onerror=err):
        base = Path(base)
        if base != root and (base / ".rpgextractor-output").is_file():
            dirs[:] = []; continue
        if base != root and (base / "manifest.json").is_file() and (base / "normalized").is_dir() and (base / "schemas").is_dir():
            dirs[:] = []; continue
        kept = []
        for d in sorted(dirs):
            p = base / d
            try:
                reject_links(p)
                if not any(inside(p, x) for x in exclude):
                    kept.append(d)
            except (OSError, UnsafePath):
                if issue:
                    issue("unsafe_link", str(p), "심볼릭 링크 또는 Windows 정션을 건너뛰었습니다.")
        dirs[:] = kept
        for f in sorted(files):
            p = base / f
            try:
                reject_links(p)
                if not any(inside(p, x) for x in exclude):
                    yield p
            except (OSError, UnsafePath):
                if issue:
                    issue("unsafe_link", str(p), "링크 파일을 건너뛰었습니다.")

def load_json(path: Path):
    reject_links(path)
    if path.stat().st_size > 128*1024*1024: raise ValueError("JSON 크기 한도 128 MiB")
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f, parse_constant=lambda value: (_ for _ in ()).throw(ValueError("비표준 JSON 숫자")))

def digest(path: Path, cancel: Callable = lambda: None) -> str:
    reject_links(path)
    h = hashlib.sha256()
    with path.open("rb") as f:
        while block := f.read(1024 * 1024):
            cancel()
            h.update(block)
    return h.hexdigest()

def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(value, f, ensure_ascii=False, allow_nan=False, indent=2)
            f.write("\n")
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)

def copy_stream(source: Path, target: Path, cancel: Callable = lambda: None):
    reject_links(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(target.name + ".tmp")
    try:
        with source.open("rb") as src, temp.open("wb") as dst:
            while block := src.read(1024 * 1024):
                cancel()
                dst.write(block)
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)
