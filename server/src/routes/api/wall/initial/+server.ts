// Unauthenticated endpoint serving the initial photo set for the TV wall.
// The wall is meant to be visible without a keyboard, so it can't go through
// the guest login flow.
import { json } from '@sveltejs/kit';
import { desc, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';
import { issueToken } from '$lib/server/token';
import { renderQrSvg } from '$lib/server/qr';

export const GET: RequestHandler = async ({ url }) => {
  const rows = await db
    .select({
      id: schema.photos.id,
      uploaderLabel: schema.photos.uploaderLabel,
      source: schema.photos.source,
      width: schema.photos.width,
      height: schema.photos.height,
      uploadedAt: schema.photos.uploadedAt,
      takenAt: schema.photos.takenAt,
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
    .limit(60);

  const photos = rows.map((p) => ({
    id: p.id,
    uploader: p.uploaderLabel,
    source: p.source,
    width: p.width,
    height: p.height,
    uploadedAt: p.uploadedAt,
    takenAt: p.takenAt,
    reactions: p.reactions ?? {},
    thumb: `/api/photos/${p.id}/file?v=thumb&wall=1`,
    wall: `/api/photos/${p.id}/file?v=wall&wall=1`,
    original: `/api/photos/${p.id}/file?v=original&wall=1`
  }));

  // Build a fresh entrance QR. Derive the base URL from the request itself
  // (Caddy passes X-Forwarded-* through), so the QR points at whatever origin
  // the TV is currently being served from — works for LAN IPs and public domains.
  // PUBLIC_BASE_URL is only used as a last-resort fallback.
  const base = (`${url.protocol}//${url.host}` || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const token = issueToken({ label: 'wall' });
  const loginUrl = `${base}/login?t=${token}`;
  const qr = renderQrSvg(loginUrl);

  return json({ photos, loginUrl, qr, displayUrl: base });
};
