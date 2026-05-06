// Photo upload + DB write logic, shared by guest and watcher endpoints.
import { extname } from 'node:path';
import { unlink } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import {
  streamToTemp,
  originalPathFor,
  moveToOriginal
} from './storage';
import { makeThumbnails } from './thumbs';
import { makeVideoPosters } from './video';
import { hub } from './sse';
import type { PhotoSummary } from '$lib/types';

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/avif',
  'image/tiff'
]);

const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

const ALLOWED_MIME = new Set([...IMAGE_MIME, ...VIDEO_MIME]);

const EXT_FROM_MIME: Record<string, string> = {
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

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB

export interface IngestInput {
  filename: string;
  mime: string;
  body: ReadableStream<Uint8Array> | Buffer;
  source: 'guest' | 'sdcard';
  uploaderId: string | null;
  uploaderLabel: string;
}

export interface IngestResult {
  id: string;
  duplicate: boolean;
}

export async function ingestPhoto(input: IngestInput): Promise<IngestResult> {
  if (!ALLOWED_MIME.has(input.mime)) {
    throw new IngestError(415, `Unsupported type: ${input.mime}`);
  }

  // 1. Stream to temp + hash
  const { tempPath, sha256, bytes } = await streamToTemp(input.body);

  if (bytes === 0) {
    await safeUnlink(tempPath);
    throw new IngestError(400, 'Empty file');
  }
  if (bytes > MAX_BYTES) {
    await safeUnlink(tempPath);
    throw new IngestError(413, 'File too large (max 200MB)');
  }

  // 2. Dedup
  const [existing] = await db
    .select({ id: schema.photos.id })
    .from(schema.photos)
    .where(eq(schema.photos.sha256, sha256))
    .limit(1);

  if (existing) {
    await safeUnlink(tempPath);
    return { id: existing.id, duplicate: true };
  }

  // 3. Move temp → final
  const ext = pickExt(input.filename, input.mime);
  const finalPath = originalPathFor(sha256, ext);
  await moveToOriginal(tempPath, finalPath);

  // 4. Posters / thumbnails
  const isVideo = input.mime.startsWith('video/');
  const { width, height, thumbPath, wallPath, takenAt } = isVideo
    ? await makeVideoPosters(finalPath, sha256)
    : await makeThumbnails(finalPath, sha256);

  // 5. Insert row
  const [row] = await db
    .insert(schema.photos)
    .values({
      source: input.source,
      uploaderId: input.uploaderId,
      uploaderLabel: input.uploaderLabel,
      sha256,
      originalPath: finalPath,
      thumbPath,
      wallPath,
      mime: input.mime,
      width,
      height,
      bytes,
      takenAt
    })
    .returning({
      id: schema.photos.id,
      uploadedAt: schema.photos.uploadedAt
    });

  // 6. Broadcast SSE event
  const summary: PhotoSummary = {
    id: row.id,
    uploader: input.uploaderLabel,
    source: input.source,
    width,
    height,
    uploadedAt: row.uploadedAt.toISOString(),
    takenAt: takenAt?.toISOString() ?? null,
    reactions: {},
    mime: input.mime,
    thumb: `/api/photos/${row.id}/file?v=thumb`,
    wall: `/api/photos/${row.id}/file?v=wall`,
    original: `/api/photos/${row.id}/file?v=original`
  };
  hub.broadcast({ type: 'photo.added', photo: summary });

  return { id: row.id, duplicate: false };
}

function pickExt(filename: string, mime: string): string {
  const fromName = extname(filename).toLowerCase();
  if (fromName && fromName.length <= 6) return fromName;
  return EXT_FROM_MIME[mime] ?? '.bin';
}

async function safeUnlink(p: string) {
  try {
    await unlink(p);
  } catch {
    /* ignore */
  }
}

export class IngestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
