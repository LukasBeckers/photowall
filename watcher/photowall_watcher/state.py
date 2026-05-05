"""Local SQLite store of already-uploaded SHA-256 hashes.

Persists across container restarts so we don't re-upload images we've seen.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable


class State:
    def __init__(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._path = path
        self._lock = threading.Lock()
        with self._conn() as c:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS seen (
                  sha256       TEXT PRIMARY KEY,
                  source_path  TEXT NOT NULL,
                  server_id    TEXT,
                  uploaded_at  REAL DEFAULT (strftime('%s','now')),
                  size_bytes   INTEGER
                );
                CREATE TABLE IF NOT EXISTS errors (
                  id           INTEGER PRIMARY KEY AUTOINCREMENT,
                  source_path  TEXT NOT NULL,
                  message      TEXT NOT NULL,
                  created_at   REAL DEFAULT (strftime('%s','now'))
                );
                """
            )

    @contextmanager
    def _conn(self):
        # SQLite connections aren't safe to share across threads without a
        # lock. We open a fresh connection each call which is fine for our
        # tiny throughput.
        conn = sqlite3.connect(self._path, timeout=10)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def is_seen(self, sha256: str) -> bool:
        with self._lock, self._conn() as c:
            row = c.execute(
                "SELECT 1 FROM seen WHERE sha256 = ?", (sha256,)
            ).fetchone()
            return row is not None

    def mark_uploaded(
        self, sha256: str, source_path: str, server_id: str, size_bytes: int
    ) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                """
                INSERT INTO seen (sha256, source_path, server_id, size_bytes)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (sha256) DO UPDATE SET
                  source_path = excluded.source_path,
                  server_id   = excluded.server_id
                """,
                (sha256, source_path, server_id, size_bytes),
            )

    def record_error(self, source_path: str, message: str) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "INSERT INTO errors (source_path, message) VALUES (?, ?)",
                (source_path, message[:500]),
            )

    def filter_unseen(self, hashes: Iterable[str]) -> set[str]:
        hashes = list(hashes)
        if not hashes:
            return set()
        seen: set[str] = set()
        # Chunk into reasonable batches in case we ever face huge cards.
        with self._lock, self._conn() as c:
            for i in range(0, len(hashes), 500):
                batch = hashes[i : i + 500]
                placeholders = ",".join("?" * len(batch))
                rows = c.execute(
                    f"SELECT sha256 FROM seen WHERE sha256 IN ({placeholders})",
                    batch,
                ).fetchall()
                seen.update(r[0] for r in rows)
        return set(hashes) - seen

    def stats(self) -> dict:
        with self._lock, self._conn() as c:
            uploaded = c.execute("SELECT COUNT(*) FROM seen").fetchone()[0]
            recent = [
                {"path": r[0], "id": r[1], "uploaded_at": r[2], "bytes": r[3]}
                for r in c.execute(
                    """
                    SELECT source_path, server_id, uploaded_at, size_bytes
                    FROM seen
                    ORDER BY uploaded_at DESC
                    LIMIT 50
                    """
                ).fetchall()
            ]
            errors = [
                {"path": r[0], "message": r[1], "at": r[2]}
                for r in c.execute(
                    """
                    SELECT source_path, message, created_at
                    FROM errors
                    ORDER BY created_at DESC
                    LIMIT 50
                    """
                ).fetchall()
            ]
            return {"uploaded": uploaded, "recent": recent, "errors": errors}
