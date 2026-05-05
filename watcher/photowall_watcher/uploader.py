"""Uploads files to the Photowall server with bounded concurrency + retries."""

from __future__ import annotations

import asyncio
import logging
import mimetypes
from pathlib import Path

import httpx

from .config import Config
from .scanner import sha256_of
from .state import State

log = logging.getLogger(__name__)

mimetypes.add_type("image/heic", ".heic")
mimetypes.add_type("image/heif", ".heif")


class Uploader:
    def __init__(self, cfg: Config, state: State) -> None:
        self._cfg = cfg
        self._state = state
        self._sem = asyncio.Semaphore(cfg.max_concurrency)
        self._client = httpx.AsyncClient(timeout=cfg.request_timeout_s)
        self._inflight = 0
        self._inflight_lock = asyncio.Lock()

    async def close(self) -> None:
        await self._client.aclose()

    async def in_flight(self) -> int:
        return self._inflight

    async def upload_path(self, path: Path) -> tuple[bool, str]:
        """Upload a single file. Returns (uploaded_or_dedupe, status_message)."""
        async with self._inflight_lock:
            self._inflight += 1
        try:
            return await self._upload_path_inner(path)
        finally:
            async with self._inflight_lock:
                self._inflight -= 1

    async def _upload_path_inner(self, path: Path) -> tuple[bool, str]:
        try:
            sha = await asyncio.to_thread(sha256_of, path)
        except (FileNotFoundError, PermissionError) as e:
            self._state.record_error(str(path), f"hash failed: {e}")
            return False, str(e)

        if self._state.is_seen(sha):
            return True, "skip (already seen)"

        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        size = path.stat().st_size

        async with self._sem:
            try:
                with path.open("rb") as f:
                    body = f.read()  # files are small; in-memory is fine
                resp = await self._post_with_retry(
                    body=body,
                    mime=mime,
                    filename=path.name,
                )
            except httpx.HTTPError as e:
                self._state.record_error(str(path), f"http: {e}")
                return False, str(e)

            if resp.status_code >= 400:
                msg = f"server {resp.status_code}: {resp.text[:200]}"
                self._state.record_error(str(path), msg)
                return False, msg

            data = resp.json()
            self._state.mark_uploaded(
                sha, str(path), data.get("id", ""), size
            )
            duplicate = data.get("duplicate", False)
            return True, "duplicate (server)" if duplicate else "uploaded"

    async def _post_with_retry(
        self, body: bytes, mime: str, filename: str
    ) -> httpx.Response:
        url = f"{self._cfg.server_url}/api/upload/sdcard"
        headers = {
            "Authorization": f"Bearer {self._cfg.watcher_token}",
            "Content-Type": mime,
            "X-Filename": filename[:200],
            "X-Label": self._cfg.label[:60],
        }
        attempts = 4
        for attempt in range(1, attempts + 1):
            try:
                resp = await self._client.post(url, content=body, headers=headers)
                if resp.status_code < 500:
                    return resp
                last_err = f"server {resp.status_code}"
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.ReadError) as e:
                last_err = str(e)
            wait = min(2 ** (attempt - 1), 10)
            log.warning(
                "upload retry %d/%d for %s: %s (sleep %ss)",
                attempt,
                attempts,
                filename,
                last_err,
                wait,
            )
            await asyncio.sleep(wait)
        # Final attempt — let the response or exception propagate.
        return await self._client.post(url, content=body, headers=headers)
