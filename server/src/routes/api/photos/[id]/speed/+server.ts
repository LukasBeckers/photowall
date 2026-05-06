import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';
import { hub } from '$lib/server/sse';
import { allow, clientIp } from '$lib/server/ratelimit';

const ALLOWED = [0.25, 0.5, 1, 1.5, 2, 4];

export const POST: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
  if (!locals.session) throw error(401, 'Unauthorized');

  const ip = clientIp(request, getClientAddress);
  if (!allow('speed', ip, { capacity: 30, refillPerSec: 1 })) {
    throw error(429, 'Slow down');
  }

  const body = (await request.json().catch(() => ({}))) as { speed?: unknown };
  const speed = Number(body.speed);
  if (!ALLOWED.includes(speed)) throw error(400, 'Bad speed');

  const [row] = await db
    .update(schema.photos)
    .set({ playbackSpeed: speed })
    .where(eq(schema.photos.id, params.id))
    .returning({ id: schema.photos.id, mime: schema.photos.mime, hiddenAt: schema.photos.hiddenAt });
  if (!row) throw error(404, 'Not found');
  if (row.hiddenAt) throw error(404, 'Not found');
  if (!row.mime.startsWith('video/')) throw error(400, 'Not a video');

  hub.broadcast({ type: 'photo.speed_changed', photoId: row.id, speed });
  return json({ id: row.id, speed });
};
