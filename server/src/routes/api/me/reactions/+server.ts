// Returns the current session's reactions so the UI can highlight already-tapped emojis.
import { json, error } from '@sveltejs/kit';
import { eq, inArray, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.session) throw error(401, 'Unauthorized');
  const ids = url.searchParams.get('ids');
  if (!ids) return json({ reactions: {} });
  const idList = ids.split(',').filter((s) => s.length > 0);
  if (idList.length === 0) return json({ reactions: {} });

  const rows = await db
    .select({ photoId: schema.reactions.photoId, emoji: schema.reactions.emoji })
    .from(schema.reactions)
    .where(
      and(
        eq(schema.reactions.sessionId, locals.session.id),
        inArray(schema.reactions.photoId, idList)
      )
    );

  const out: Record<string, string[]> = {};
  for (const r of rows) {
    (out[r.photoId] ??= []).push(r.emoji);
  }
  return json({ reactions: out });
};
