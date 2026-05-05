import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';
import { streamFile } from '$lib/server/storage';

const VARIANTS = new Set(['thumb', 'wall', 'original']);

export const GET: RequestHandler = async ({ params, url, locals, request }) => {
  // Wall display has no login, so it requests files with ?wall=1.
  const isWall = url.searchParams.get('wall') === '1';
  if (!isWall && !locals.session && !locals.admin) throw error(401, 'Unauthorized');

  const variant = url.searchParams.get('v') ?? 'thumb';
  if (!VARIANTS.has(variant)) throw error(400, 'Bad variant');

  const [row] = await db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, params.id))
    .limit(1);
  if (!row) throw error(404, 'Not found');
  if (row.hiddenAt && !locals.admin) throw error(404, 'Not found');

  const path =
    variant === 'original' ? row.originalPath : variant === 'wall' ? row.wallPath : row.thumbPath;
  const mime =
    variant === 'original' ? row.mime : 'image/jpeg';
  const download = url.searchParams.get('download') === '1';
  const filename = `${row.id}${variant === 'original' ? extFromMime(row.mime) : '.jpg'}`;

  const st = await stat(path);
  const headers: Record<string, string> = {
    'content-type': mime,
    'content-length': String(st.size),
    'cache-control': variant === 'original' ? 'private, max-age=300' : 'public, max-age=31536000, immutable'
  };
  if (download) headers['content-disposition'] = `attachment; filename="${filename}"`;

  // HEAD short-circuit
  if (request.method === 'HEAD') return new Response(null, { headers });

  const stream = streamFile(path);
  return new Response(Readable.toWeb(stream as any) as ReadableStream, { headers });
};

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/heic') return '.heic';
  if (mime === 'image/heif') return '.heif';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/avif') return '.avif';
  if (mime === 'image/tiff') return '.tiff';
  return '';
}
