import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.session && !locals.admin) throw error(401, 'Unauthorized');

  const [row] = await db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, params.id))
    .limit(1);
  if (!row) throw error(404, 'Not found');
  if (row.hiddenAt && !locals.admin) throw error(404, 'Not found');

  // Aggregate reactions
  const reactionRows = await db
    .select({
      emoji: schema.reactions.emoji,
      count: sqlCount()
    })
    .from(schema.reactions)
    .where(eq(schema.reactions.photoId, row.id))
    .groupBy(schema.reactions.emoji);

  const reactions: Record<string, number> = {};
  for (const r of reactionRows) reactions[r.emoji] = Number(r.count);

  return json({
    id: row.id,
    uploader: row.uploaderLabel,
    source: row.source,
    width: row.width,
    height: row.height,
    uploadedAt: row.uploadedAt,
    takenAt: row.takenAt,
    hiddenAt: row.hiddenAt,
    reactions,
    thumb: `/api/photos/${row.id}/file?v=thumb`,
    wall: `/api/photos/${row.id}/file?v=wall`,
    original: `/api/photos/${row.id}/file?v=original`
  });
};

import { sql } from 'drizzle-orm';
function sqlCount() {
  return sql<number>`count(*)::int`;
}
