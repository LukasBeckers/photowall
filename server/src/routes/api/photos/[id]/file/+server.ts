import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';
import { streamFile, wallVideoPathFor, fileExists } from '$lib/server/storage';

const VARIANTS = new Set(['thumb', 'wall', 'original', 'wall_video']);

function parseRange(header: string, size: number): { start: number; end: number } | null {
  // Only accept simple byte ranges. Spec: "bytes=START-END" or "bytes=START-".
  const m = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : size - 1;
  if (start > end || end >= size) return null;
  return { start, end };
}

export const GET: RequestHandler = async ({ params, url, locals, request }) => {
  if (!locals.session && !locals.admin) throw error(401, 'Unauthorized');

  const variant = url.searchParams.get('v') ?? 'thumb';
  if (!VARIANTS.has(variant)) throw error(400, 'Bad variant');

  const [row] = await db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, params.id))
    .limit(1);
  if (!row) throw error(404, 'Not found');
  if (row.hiddenAt && !locals.admin) throw error(404, 'Not found');

  let path: string;
  let mime: string;
  if (variant === 'original') {
    path = row.originalPath;
    mime = row.mime;
  } else if (variant === 'wall') {
    path = row.wallPath;
    mime = 'image/jpeg';
  } else if (variant === 'wall_video') {
    if (!row.mime.startsWith('video/')) throw error(400, 'wall_video only for videos');
    const previewPath = wallVideoPathFor(row.sha256);
    if (await fileExists(previewPath)) {
      path = previewPath;
      mime = 'video/mp4';
    } else {
      // Backfill not yet run — fall back to the original so the wall keeps working.
      path = row.originalPath;
      mime = row.mime;
    }
  } else {
    path = row.thumbPath;
    mime = 'image/jpeg';
  }
  const download = url.searchParams.get('download') === '1';
  const filename = `${row.id}${variant === 'original' ? extFromMime(row.mime) : variant === 'wall_video' ? '.mp4' : '.jpg'}`;

  const st = await stat(path);
  // Originals get a short private cache (admin-downloadable, large). Derived
  // variants (thumb/wall/wall_video) are content-addressed by sha256, so they
  // can be aggressively immutable-cached.
  const cache =
    variant === 'original'
      ? 'private, max-age=300'
      : 'public, max-age=31536000, immutable';

  // Range support — needed so <video> can scrub without redownloading.
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const range = parseRange(rangeHeader, st.size);
    if (range) {
      const headers: Record<string, string> = {
        'content-type': mime,
        'content-length': String(range.end - range.start + 1),
        'content-range': `bytes ${range.start}-${range.end}/${st.size}`,
        'accept-ranges': 'bytes',
        'cache-control': cache
      };
      if (download) headers['content-disposition'] = `attachment; filename="${filename}"`;
      if (request.method === 'HEAD') return new Response(null, { status: 206, headers });
      const partial = createReadStream(path, { start: range.start, end: range.end });
      return new Response(Readable.toWeb(partial as any) as ReadableStream, {
        status: 206,
        headers
      });
    }
    // Invalid Range → 416
    return new Response(null, {
      status: 416,
      headers: { 'content-range': `bytes */${st.size}` }
    });
  }

  const headers: Record<string, string> = {
    'content-type': mime,
    'content-length': String(st.size),
    'accept-ranges': 'bytes',
    'cache-control': cache
  };
  if (download) headers['content-disposition'] = `attachment; filename="${filename}"`;

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
