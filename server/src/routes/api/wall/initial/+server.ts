// Initial photo set + presentation metadata for the TV wall.
// Now session-gated (the host signs in once on the TV with the party password).
// We can therefore safely include the party password in the response so the
// wall can show it as a fallback for guests who can't scan the QR.
import { json, error } from '@sveltejs/kit';
import { desc, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';
import { issueToken } from '$lib/server/token';
import { renderQrSvg } from '$lib/server/qr';
import { getSetting } from '$lib/server/settings';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.session) throw error(401, 'Unauthorized');

  const cellSize = await getSetting<number>('wall_cell_size', 200);
  const maxCells = await getSetting<number>('wall_max_cells', 40);

  const rows = await db
    .select({
      id: schema.photos.id,
      uploaderLabel: schema.photos.uploaderLabel,
      source: schema.photos.source,
      mime: schema.photos.mime,
      width: schema.photos.width,
      height: schema.photos.height,
      uploadedAt: schema.photos.uploadedAt,
      takenAt: schema.photos.takenAt,
      playbackSpeed: schema.photos.playbackSpeed,
      reactions: sql<Record<string, number>>`(
        SELECT COALESCE(json_object_agg(emoji, n), '{}'::json)
        FROM (
          SELECT emoji, COUNT(*)::int AS n
          FROM ${schema.reactions}
          WHERE ${schema.reactions.photoId} = ${schema.photos.id}
          GROUP BY emoji
        ) sub
      )`.as('reactions')
    })
    .from(schema.photos)
    .where(isNull(schema.photos.hiddenAt))
    .orderBy(desc(schema.photos.uploadedAt))
    .limit(maxCells);

  const photos = rows.map((p) => ({
    id: p.id,
    uploader: p.uploaderLabel,
    source: p.source,
    mime: p.mime,
    width: p.width,
    height: p.height,
    uploadedAt: p.uploadedAt,
    takenAt: p.takenAt,
    reactions: p.reactions ?? {},
    speed: p.playbackSpeed,
    thumb: `/api/photos/${p.id}/file?v=thumb`,
    wall: `/api/photos/${p.id}/file?v=wall`,
    original: `/api/photos/${p.id}/file?v=original`,
    wallVideo: p.mime.startsWith('video/') ? `/api/photos/${p.id}/file?v=wall_video` : undefined
  }));

  // Always derive the base URL from the request. Caddy passes X-Forwarded-Proto
  // and X-Forwarded-Host through, so this matches whatever origin the TV is
  // being served at — LAN IP, public domain, anything.
  const base = `${url.protocol}//${url.host}`;
  const token = issueToken({ label: 'wall' });
  const loginUrl = `${base}/login?t=${token}`;
  const qr = await renderQrSvg(loginUrl);
  const partyPassword = process.env.PARTY_PASSWORD ?? '';

  return json({ photos, loginUrl, qr, displayUrl: base, partyPassword, cellSize, maxCells });
};
