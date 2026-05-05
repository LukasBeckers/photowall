"""Tiny status web UI on :8080. Shows queue depth, recent uploads, errors.

Lets the human at the party glance at the laptop and confirm uploads are happening.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse


def build_app(stats_provider, rescan_callback) -> FastAPI:
    app = FastAPI()

    @app.get("/api/status")
    async def status() -> JSONResponse:
        return JSONResponse(stats_provider())

    @app.post("/api/rescan")
    async def rescan() -> JSONResponse:
        ok = await rescan_callback()
        return JSONResponse({"ok": ok})

    @app.get("/", response_class=HTMLResponse)
    async def index() -> HTMLResponse:
        s = stats_provider()
        recent_html = "".join(
            f"<tr><td>{_fmt_time(r['uploaded_at'])}</td>"
            f"<td>{(r['bytes'] or 0) // 1024} KB</td>"
            f"<td><code>{_escape(r['path'])}</code></td>"
            f"<td>{_escape((r['id'] or '')[:8])}</td></tr>"
            for r in s["recent"]
        )
        errors_html = (
            "".join(
                f"<tr><td>{_fmt_time(e['at'])}</td>"
                f"<td><code>{_escape(e['path'])}</code></td>"
                f"<td>{_escape(e['message'])}</td></tr>"
                for e in s["errors"]
            )
            or "<tr><td colspan=3>No errors</td></tr>"
        )
        body = f"""
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Photowall watcher</title>
<style>
body {{ font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 900px; padding: 0 1rem; }}
h1 {{ margin: 0 0 .5rem; }}
.stats {{ display: flex; gap: 2rem; margin: 1rem 0 2rem; }}
.stat {{ background: #f5f5f7; border-radius: .5rem; padding: 1rem 1.25rem; }}
.stat .n {{ font-size: 2rem; font-weight: 700; }}
.stat .l {{ color: #666; font-size: .85rem; }}
table {{ width: 100%; border-collapse: collapse; font-size: .9rem; }}
th, td {{ text-align: left; padding: .35rem .5rem; border-bottom: 1px solid #eee; }}
th {{ color: #666; }}
form {{ display: inline-block; margin-bottom: 1rem; }}
button {{ padding: .5rem 1rem; border-radius: .35rem; border: 1px solid #ccc; background: #fff; cursor: pointer; }}
section {{ margin-bottom: 2rem; }}
@media (prefers-color-scheme: dark) {{
  body {{ background: #0d0d0f; color: #eee; }}
  .stat {{ background: #1a1a1d; }}
  th, td {{ border-color: #2a2a2d; }}
  button {{ background: #1a1a1d; color: #eee; border-color: #333; }}
}}
</style></head><body>
<h1>Photowall watcher</h1>
<p>Auto-uploads photos from any SD card or USB stick mounted on this laptop.</p>
<div class="stats">
  <div class="stat"><div class="n">{s['uploaded']}</div><div class="l">Total uploaded</div></div>
  <div class="stat"><div class="n">{s.get('inflight', 0)}</div><div class="l">In flight</div></div>
  <div class="stat"><div class="n">{len(s['errors'])}</div><div class="l">Errors</div></div>
</div>
<form method="POST" action="/api/rescan" onsubmit="event.preventDefault(); fetch('/api/rescan',{{method:'POST'}}).then(()=>location.reload());">
  <button type="submit">Rescan now</button>
</form>
<section>
  <h2>Recent uploads</h2>
  <table><thead><tr><th>When</th><th>Size</th><th>Path</th><th>Server id</th></tr></thead>
  <tbody>{recent_html or "<tr><td colspan=4>Nothing yet.</td></tr>"}</tbody></table>
</section>
<section>
  <h2>Errors</h2>
  <table><thead><tr><th>When</th><th>Path</th><th>Error</th></tr></thead>
  <tbody>{errors_html}</tbody></table>
</section>
</body></html>
"""
        return HTMLResponse(body)

    return app


def _fmt_time(ts: float | None) -> str:
    if not ts:
        return "—"
    dt = datetime.fromtimestamp(ts, tz=timezone.utc).astimezone()
    return dt.strftime("%H:%M:%S")


def _escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
