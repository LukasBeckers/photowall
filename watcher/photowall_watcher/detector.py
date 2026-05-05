"""Detects mounted removable media and triggers scans.

Runs two strategies in parallel:
  1. pyudev observer: fires on `block` `add` events (SD card / USB inserted).
  2. Mount-poll loop: every few seconds, lists subdirs of MEDIA_ROOT and emits
     events for newly-appeared mounts. This is the real signal — udev tells us
     a device exists, but we need the OS to actually mount it.

Anything appearing under MEDIA_ROOT after startup is treated as a candidate
mount.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from pathlib import Path
from typing import Awaitable, Callable

log = logging.getLogger(__name__)

MountHandler = Callable[[Path], Awaitable[None]]


class MountWatcher:
    def __init__(self, media_root: Path, on_mount: MountHandler) -> None:
        self._root = media_root
        self._on_mount = on_mount
        self._known: set[Path] = set()
        self._stop = asyncio.Event()
        self._loop: asyncio.AbstractEventLoop | None = None

    async def run(self) -> None:
        self._loop = asyncio.get_running_loop()
        # Seed known mounts so we don't fire on startup for things already mounted.
        for p in self._iter_mount_candidates():
            self._known.add(p)
        log.info("watching %s (initial mounts: %d)", self._root, len(self._known))
        # Start the udev observer in a background thread (best effort)
        self._start_udev_thread()

        # Poll loop
        while not self._stop.is_set():
            try:
                await self._scan_once()
            except Exception:
                log.exception("scan_once failed")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                pass

    def stop(self) -> None:
        self._stop.set()

    async def _scan_once(self) -> None:
        for p in self._iter_mount_candidates():
            if p not in self._known:
                self._known.add(p)
                log.info("new mount detected: %s", p)
                # Give the OS a beat to finish populating the mount
                await asyncio.sleep(1.0)
                try:
                    await self._on_mount(p)
                except Exception:
                    log.exception("on_mount handler failed for %s", p)
        # Drop entries that have disappeared so re-inserting works.
        for p in list(self._known):
            if not p.exists():
                self._known.discard(p)
                log.info("mount removed: %s", p)

    def _iter_mount_candidates(self):
        if not self._root.exists():
            return
        try:
            for entry in self._root.iterdir():
                # On many Linux distros media is mounted under /media/<user>/<label>
                # so we recurse one level: any directory two levels under media_root
                # OR any direct child (covers Raspberry Pi-style /media/<label>).
                if entry.is_dir():
                    yield entry
                    try:
                        for sub in entry.iterdir():
                            if sub.is_dir():
                                yield sub
                    except (PermissionError, OSError):
                        pass
        except (PermissionError, OSError) as e:
            log.warning("can't list %s: %s", self._root, e)

    def _start_udev_thread(self) -> None:
        def _run() -> None:
            try:
                import pyudev  # type: ignore
            except ImportError:
                log.warning("pyudev not available, falling back to poll only")
                return
            try:
                ctx = pyudev.Context()
                monitor = pyudev.Monitor.from_netlink(ctx)
                monitor.filter_by(subsystem="block")
                for device in iter(monitor.poll, None):
                    if device.action != "add":
                        continue
                    log.info(
                        "udev event: %s (%s)",
                        device.device_node,
                        device.get("ID_FS_TYPE", "?"),
                    )
                    # Just nudge the loop; the poll-based scanner will pick up the mount.
                    if self._loop is not None and self._loop.is_running():
                        try:
                            asyncio.run_coroutine_threadsafe(
                                _kick(self._stop), self._loop
                            )
                        except Exception:
                            pass
            except Exception:
                log.exception("udev thread crashed")

        t = threading.Thread(target=_run, name="udev-monitor", daemon=True)
        t.start()


async def _kick(_stop: asyncio.Event) -> None:
    # Tiny coroutine that yields control so the scan loop wakes up sooner.
    await asyncio.sleep(0)
