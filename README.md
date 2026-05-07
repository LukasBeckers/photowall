# Photowall

Live photo wall for a party. Guests upload photos from their phones and react
with emoji, the TV shows an auto-cycling mosaic that animates as new photos
arrive, and a laptop at the venue auto-uploads from any SD card someone plugs in.

Design doc: `/home/gpu-server-swr-0/.claude/plans/sharded-zooming-rose.md`.

## Repo layout

| Path | What |
|------|------|
| `server/` | SvelteKit web app (TV + guest + admin UIs, REST + SSE API) |
| `watcher/` | Python SD-card watcher (auto-uploads from SD cards / USB sticks) |
| `docker-compose.yml` | Server stack: app + Postgres + Caddy |
| `docker-compose.watcher.yml` | Laptop stack: just the watcher |
| `Caddyfile` | Reverse proxy + auto-HTTPS |
| `.env.example` | Template for all env vars (copy to `.env`) |

## URLs (after deploy)

- `https://your.domain.com/` — guest upload + gallery (login required)
- `https://your.domain.com/wall` — TV wall mosaic (no login, point your TV browser here)
- `https://your.domain.com/admin` — admin (hide / delete photos, generate QR, download archive)

## Local dev

```bash
cp .env.example .env
# edit .env — at minimum, set the change-me-* values
docker compose up -d --build
curl http://localhost/health   # → {"ok":true}
open http://localhost          # log in with $PARTY_PASSWORD
```

## Production deploy (home server, public domain)

1. Point an A record at your server's public IP.
2. Make sure ports 80 and 443 are forwarded / open.
3. On the server:
   ```bash
   git clone <this repo>
   cd photowall
   cp .env.example .env
   ```
4. Edit `.env` and set:
   - `CADDY_DOMAIN=photowall.your-domain.com`
   - `PUBLIC_BASE_URL=https://photowall.your-domain.com`
   - All `change-me-*` secrets — generate with `openssl rand -hex 32`
   - Optional: uncomment + set `email you@example.com` in `Caddyfile` for ACME notifications
5. `docker compose up -d --build`
6. Visit `https://photowall.your-domain.com` — Caddy fetches a Let's Encrypt cert
   automatically the first time it's hit.

### Generating secrets quickly

```bash
for k in JWT_SECRET QR_TOKEN_SECRET WATCHER_TOKEN; do
  echo "$k=$(openssl rand -hex 32)"
done
```

### Backup

Photos live in `./data/`, the database in `./db/`. Both are bind-mounted; back
them up however you back up the rest of your home server.

## Watcher deploy (laptop at the venue)

The watcher container needs `/dev`, `/run/udev`, and `/media` from the host
(Linux only — Mac/Windows can't pass udev events into Docker).

1. On the laptop, install Docker.
2. Clone this repo.
3. Create `.env`:
   ```
   SERVER_URL=https://photowall.your-domain.com
   WATCHER_TOKEN=<same value as on server>
   UPLOAD_LABEL=Camera (SD card)
   ```
4. `docker compose -f docker-compose.watcher.yml up -d --build`
5. Open `http://localhost:8080` on the laptop to see the status page.

The watcher will scan any SD card / USB stick mounted under `/media` (which is
where most Linux desktops mount removable media). It computes a SHA-256 of each
image, skips anything it's seen before, and uploads new ones via bearer-token
auth. State is persisted to `./watcher-state/state.db`, so you can unplug and
re-insert the same card without duplicate uploads.

## Maintenance

### Regenerate thumbnails

If you bump the dimension constants in `server/src/lib/server/thumbs.ts`, run
this once to refresh existing photos (new uploads pick up the new sizes
automatically):

```bash
docker compose exec app node scripts/regenerate-thumbs.mjs
```

It iterates every photo, deletes the old thumb + wall files, and rebuilds
them. Idempotent — safe to re-run if it errors on a few files.

## Implementation status

- [x] Phase 1 — Skeleton (compose, db, sveltekit boots, /health works)
- [x] Phase 2 — Auth (party password + QR token + admin)
- [x] Phase 3 — Upload pipeline (storage, sharp thumbs, dedup, watcher endpoint)
- [x] Phase 4 — Guest gallery + reactions
- [x] Phase 5 — SSE + TV wall mosaic
- [x] Phase 6 — Admin dashboard, QR generation, archive zip
- [x] Phase 7 — Python SD-card watcher container
- [x] Phase 8 — Production deploy config (this section)
- [x] Phase 9 — Polish (rate limits, PWA manifest, icon)

## Architecture at a glance

```
                ┌──────────────────────────────────────────────┐
                │            home server (Docker)              │
                │                                              │
   internet ────┼──▶ Caddy ──▶ SvelteKit app ──▶ Postgres      │
                │   (HTTPS)    │                               │
                │              ├── /        guest UI           │
                │              ├── /wall    TV mosaic          │
                │              ├── /admin   admin              │
                │              ├── /api/*   REST + SSE         │
                │              └── /api/upload/sdcard          │
                │                                              │
                └─────────────────────▲────────────────────────┘
                                      │  HTTPS + bearer token
                                      │
                ┌─────────────────────┼────────────────────────┐
                │           party laptop (Docker)              │
                │                     │                        │
                │   pyudev ──▶ scanner + uploader ──▶  ────────┘
                │                     │
                │            FastAPI :8080 (status page)
                └──────────────────────────────────────────────┘
```
