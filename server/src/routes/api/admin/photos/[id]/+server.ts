import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';
import { hub } from '$lib/server/sse';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.admin) throw error(403, 'Forbidden');
  const body = (await request.json().catch(() => ({}))) as { hidden?: unknown; reason?: unknown };
  const hide = body.hidden === true;
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : null;

  const [row] = await db
    .update(schema.photos)
    .set({
      hiddenAt: hide ? new Date() : null,
      hiddenReason: hide ? reason : null
    })
    .where(eq(schema.photos.id, params.id))
    .returning({ id: schema.photos.id });
  if (!row) throw error(404, 'Not found');

  if (hide) hub.broadcast({ type: 'photo.hidden', photoId: row.id });
  return json({ id: row.id, hidden: hide });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.admin) throw error(403, 'Forbidden');

  const [row] = await db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, params.id))
    .limit(1);
  if (!row) throw error(404, 'Not found');

  await db.delete(schema.photos).where(eq(schema.photos.id, params.id));

  // Best-effort cleanup of files. Reactions cascade via FK.
  for (const p of [row.originalPath, row.thumbPath, row.wallPath]) {
    try {
      await unlink(p);
    } catch {
      // file may already be missing — that's fine
    }
  }

  hub.broadcast({ type: 'photo.hidden', photoId: row.id });
  return json({ id: row.id, deleted: true });
};
