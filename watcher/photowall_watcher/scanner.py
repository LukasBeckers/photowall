"""Walks a directory, finds image files, computes SHA-256s.

Skips well-known noise directories (system files, recycle bins).
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Iterator

log = logging.getLogger(__name__)

IMAGE_EXTS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".heic",
    ".heif",
    ".webp",
    ".tif",
    ".tiff",
    # Raw formats — server will mostly reject these, but include them so
    # a future variant that accepts raws still works.
    ".nef",
    ".cr2",
    ".cr3",
    ".arw",
    ".dng",
    ".raf",
    ".orf",
    ".rw2",
}

SKIP_DIR_NAMES = {
    ".trashes",
    ".trash",
    ".spotlight-v100",
    ".fseventsd",
    "$recycle.bin",
    "system volume information",
    ".thumbnails",
    ".lrcat-helper",
}


def walk_images(root: Path) -> Iterator[Path]:
    """Yield image files anywhere under root, skipping system noise dirs."""
    if not root.exists():
        return
    stack = [root]
    while stack:
        d = stack.pop()
        try:
            for entry in d.iterdir():
                # Skip symlinks defensively — avoids loops on weird filesystems.
                if entry.is_symlink():
                    continue
                if entry.is_dir():
                    if entry.name.lower() in SKIP_DIR_NAMES:
                        continue
                    stack.append(entry)
                elif entry.is_file():
                    if entry.suffix.lower() in IMAGE_EXTS:
                        yield entry
        except (PermissionError, OSError) as e:
            log.warning("scanner: skipping %s: %s", d, e)


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
