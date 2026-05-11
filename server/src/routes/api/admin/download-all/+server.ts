import { error } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { Readable } from 'node:stream';
import archiver from 'archiver';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.admin) throw error(403, 'Forbidden');

  const rows = await db
    .select({
      id: schema.photos.id,
      originalPath: schema.photos.originalPath,
      mime: schema.photos.mime,
      uploadedAt: schema.photos.uploadedAt,
      uploaderLabel: schema.photos.uploaderLabel
    })
    .from(schema.photos)
    .orderBy(desc(schema.photos.uploadedAt));

  const archive = archiver('zip', { zlib: { level: 1 } }); // light compression — JPEGs don't shrink

  for (const r of rows) {
    const yyyy = r.uploadedAt.getUTCFullYear();
    const mm = String(r.uploadedAt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(r.uploadedAt.getUTCDate()).padStart(2, '0');
    const ext = extFromMime(r.mime) || '.bin';
    const safeUploader = r.uploaderLabel.replace(/[^a-zA-Z0-9 _-]/g, '_').slice(0, 40);
    const name = `${yyyy}-${mm}/${yyyy}-${mm}-${dd}_${safeUploader}_${r.id.slice(0, 8)}${ext}`;
    archive.file(r.originalPath, { name });
  }

  archive.finalize();

  const filename = `photowall-archive-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store'
    }
  });
};

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/tiff': '.tiff',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm'
  };
  return map[mime] ?? '';
}
