"""Entry point. Wires the detector, scanner, uploader, state, and status page."""

from __future__ import annotations

import asyncio
import logging
import os
import signal
from pathlib import Path

import uvicorn

from .config import Config
from .detector import MountWatcher
from .scanner import walk_images
from .state import State
from .status import build_app
from .uploader import Uploader

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("photowall-watcher")


async def main() -> None:
    cfg = Config.from_env()
    state = State(cfg.state_path)
    uploader = Uploader(cfg, state)
    last_mount: list[Path] = []  # mutable shared state

    async def scan_and_upload(root: Path) -> None:
        log.info("scanning %s", root)
        files = list(walk_images(root))
        log.info("found %d candidate images under %s", len(files), root)
        for f in files:
            try:
                ok, msg = await uploader.upload_path(f)
                level = log.info if ok else log.warning
                level("%s -> %s", f, msg)
            except Exception:
                log.exception("upload failed: %s", f)

    async def on_mount(path: Path) -> None:
        last_mount.clear()
        last_mount.append(path)
        await scan_and_upload(path)

    async def rescan() -> bool:
        if not last_mount:
            log.info("rescan requested but no recent mount; scanning media root")
            await scan_and_upload(Path(cfg.media_root))
            return True
        await scan_and_upload(last_mount[-1])
        return True

    def stats_provider() -> dict:
        s = state.stats()
        s["inflight"] = uploader._inflight  # type: ignore[attr-defined]
        s["last_mount"] = str(last_mount[-1]) if last_mount else None
        return s

    # Web UI
    app = build_app(stats_provider, rescan)
    app_config = uvicorn.Config(
        app, host="0.0.0.0", port=cfg.status_port, log_level="warning"
    )
    server = uvicorn.Server(app_config)

    # Detector
    watcher = MountWatcher(Path(cfg.media_root), on_mount)

    stop = asyncio.Event()

    def _on_signal() -> None:
        log.info("shutting down")
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _on_signal)
        except NotImplementedError:
            pass

    log.info("starting (server=%s, media=%s)", cfg.server_url, cfg.media_root)

    server_task = asyncio.create_task(server.serve())
    watcher_task = asyncio.create_task(watcher.run())

    # Initial scan of media root in case there are mounts already present.
    asyncio.create_task(scan_and_upload(Path(cfg.media_root)))

    await stop.wait()

    watcher.stop()
    server.should_exit = True
    await asyncio.gather(server_task, watcher_task, return_exceptions=True)
    await uploader.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
