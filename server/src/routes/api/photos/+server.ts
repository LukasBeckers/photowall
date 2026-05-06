import { json, error } from '@sveltejs/kit';
import { desc, isNull, lt, and, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';

const PAGE_SIZE = 30;

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.session && !locals.admin) throw error(401, 'Unauthorized');

  const before = url.searchParams.get('before'); // ISO timestamp for keyset pagination
  const limit = Math.min(Number(url.searchParams.get('limit') ?? PAGE_SIZE), 100);

  const where = before
    ? and(isNull(schema.photos.hiddenAt), lt(schema.photos.uploadedAt, new Date(before)))
    : isNull(schema.photos.hiddenAt);

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
    .where(where)
    .orderBy(desc(schema.photos.uploadedAt))
    .limit(limit);

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
    thumb: `/api/photos/${p.id}/file?v=thumb`,
    wall: `/api/photos/${p.id}/file?v=wall`,
    original: `/api/photos/${p.id}/file?v=original`
  }));

  const nextBefore =
    photos.length === limit ? photos[photos.length - 1].uploadedAt.toISOString() : null;

  return json({ photos, nextBefore });
};
