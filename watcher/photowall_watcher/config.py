import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    server_url: str
    watcher_token: str
    state_path: str
    media_root: str
    label: str
    max_concurrency: int
    request_timeout_s: float
    status_port: int

    @classmethod
    def from_env(cls) -> "Config":
        server_url = os.environ.get("SERVER_URL", "").rstrip("/")
        token = os.environ.get("WATCHER_TOKEN", "")
        if not server_url:
            raise SystemExit("SERVER_URL is required")
        if not token:
            raise SystemExit("WATCHER_TOKEN is required")
        return cls(
            server_url=server_url,
            watcher_token=token,
            state_path=os.environ.get(
                "STATE_PATH", "/var/lib/photowall-watcher/state.db"
            ),
            media_root=os.environ.get("MEDIA_ROOT", "/media"),
            label=os.environ.get("UPLOAD_LABEL", "Camera (SD card)"),
            max_concurrency=int(os.environ.get("MAX_CONCURRENCY", "4")),
            request_timeout_s=float(os.environ.get("REQUEST_TIMEOUT", "60")),
            status_port=int(os.environ.get("STATUS_PORT", "8080")),
        )
