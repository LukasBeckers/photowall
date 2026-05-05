import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import {
  thumbPathFor,
  wallPathFor,
  writeFileSafe,
  fileExists
} from './storage';

const GALLERY_MAX = 400;
const WALL_MAX = 1280;

export interface ThumbResult {
  width: number;
  height: number;
  thumbPath: string;
  wallPath: string;
  takenAt: Date | null;
}

/**
 * Generate gallery + wall thumbnails from an original file. Honors EXIF
 * orientation. Idempotent: skips work if both targets already exist.
 */
export async function makeThumbnails(originalPath: string, sha256: string): Promise<ThumbResult> {
  const thumbPath = thumbPathFor(sha256);
  const wallPath = wallPathFor(sha256);

  const buf = await readFile(originalPath);

  // Read metadata once — gives us dimensions and EXIF.
  const meta = await sharp(buf).metadata();
  const orientedWidth =
    meta.orientation && meta.orientation >= 5 ? meta.height ?? 0 : meta.width ?? 0;
  const orientedHeight =
    meta.orientation && meta.orientation >= 5 ? meta.width ?? 0 : meta.height ?? 0;

  const takenAt = extractTakenAt(meta);

  if (!(await fileExists(thumbPath))) {
    const out = await sharp(buf)
      .rotate() // applies EXIF orientation, then strips it
      .resize({
        width: GALLERY_MAX,
        height: GALLERY_MAX,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    await writeFileSafe(thumbPath, out);
  }

  if (!(await fileExists(wallPath))) {
    const out = await sharp(buf)
      .rotate()
      .resize({
        width: WALL_MAX,
        height: WALL_MAX,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    await writeFileSafe(wallPath, out);
  }

  return {
    width: orientedWidth || meta.width || 0,
    height: orientedHeight || meta.height || 0,
    thumbPath,
    wallPath,
    takenAt
  };
}

function extractTakenAt(meta: sharp.Metadata): Date | null {
  if (!meta.exif) return null;
  // Lazy import: only used here.
  // sharp's `exif` is a raw Buffer. We try a best-effort parse.
  try {
    // Standard EXIF DateTimeOriginal is "YYYY:MM:DD HH:MM:SS"
    const text = meta.exif.toString('latin1');
    const m = text.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
    const date = new Date(iso);
    if (isNaN(+date)) return null;
    return date;
  } catch {
    return null;
  }
}
