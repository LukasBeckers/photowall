import { json, error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';
import { isAllowedEmoji } from '$lib/emoji';
import { allow, clientIp } from '$lib/server/ratelimit';
import { hub } from '$lib/server/sse';

export const POST: RequestHandler = async (event) => {
  const { params, request, locals, getClientAddress } = event;
  if (!locals.session) throw error(401, 'Unauthorized');

  const ip = clientIp(request, getClientAddress);
  if (!allow('react', ip, { capacity: 60, refillPerSec: 1 })) {
    throw error(429, 'Slow down on the reactions.');
  }

  const body = (await request.json().catch(() => ({}))) as { emoji?: unknown };
  const emoji = typeof body.emoji === 'string' ? body.emoji : '';
  if (!isAllowedEmoji(emoji)) throw error(400, 'Bad emoji');

  // Verify the photo exists and isn't hidden
  const [photo] = await db
    .select({ id: schema.photos.id, hiddenAt: schema.photos.hiddenAt })
    .from(schema.photos)
    .where(eq(schema.photos.id, params.id))
    .limit(1);
  if (!photo) throw error(404, 'Not found');
  if (photo.hiddenAt) throw error(404, 'Not found');

  await db
    .insert(schema.reactions)
    .values({
      photoId: photo.id,
      sessionId: locals.session.id,
      emoji
    })
    .onConflictDoNothing();

  const counts = await fetchCounts(photo.id);
  hub.broadcast({ type: 'reaction.changed', photoId: photo.id, counts });
  return json({ photoId: photo.id, counts });
};

export const DELETE: RequestHandler = async (event) => {
  const { params, request, locals } = event;
  if (!locals.session) throw error(401, 'Unauthorized');

  const body = (await request.json().catch(() => ({}))) as { emoji?: unknown };
  const emoji = typeof body.emoji === 'string' ? body.emoji : '';
  if (!isAllowedEmoji(emoji)) throw error(400, 'Bad emoji');

  await db
    .delete(schema.reactions)
    .where(
      and(
        eq(schema.reactions.photoId, params.id),
        eq(schema.reactions.sessionId, locals.session.id),
        eq(schema.reactions.emoji, emoji)
      )
    );

  const counts = await fetchCounts(params.id);
  hub.broadcast({ type: 'reaction.changed', photoId: params.id, counts });
  return json({ photoId: params.id, counts });
};

async function fetchCounts(photoId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      emoji: schema.reactions.emoji,
      count: sql<number>`count(*)::int`.as('count')
    })
    .from(schema.reactions)
    .where(eq(schema.reactions.photoId, photoId))
    .groupBy(schema.reactions.emoji);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.emoji] = Number(r.count);
  return out;
}
