#!/usr/bin/env node
// Regenerate gallery + wall thumbnails for every photo on disk. Run once
// after bumping the dimension constants in lib/server/thumbs.ts so existing
// photos pick up the new sharpness. Idempotent — safe to re-run.
//
//   docker compose exec app node scripts/regenerate-thumbs.mjs
import { readFile, unlink, copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import postgres from 'postgres';

const exec = promisify(execFile);

// Keep these in sync with lib/server/thumbs.ts.
const GALLERY_MAX = 800;
const WALL_MAX = 2560;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const rows = await sql`
  SELECT id, sha256, mime, original_path, thumb_path, wall_path
  FROM photos
  ORDER BY uploaded_at DESC
`;

console.log(`regenerating thumbs for ${rows.length} photos…`);

let done = 0;
let failed = 0;

async function safeUnlink(p) {
  try {
    await unlink(p);
  } catch {
    /* ENOENT is fine */
  }
}

async function ensureDir(p) {
  await mkdir(dirname(p), { recursive: true });
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

for (const row of rows) {
  try {
    if (!(await fileExists(row.original_path))) {
      console.error(`  ! ${row.id}: missing original ${row.original_path}, skipping`);
      failed++;
      continue;
    }

    await safeUnlink(row.thumb_path);
    if (row.wall_path !== row.thumb_path) await safeUnlink(row.wall_path);
    await ensureDir(row.thumb_path);
    await ensureDir(row.wall_path);

    if (row.mime.startsWith('video/')) {
      // Re-extract a single JPEG frame via ffmpeg at native resolution.
      // Mirrors lib/server/video.ts.
      let seek = '0';
      try {
        const { stdout } = await exec(
          'ffprobe',
          ['-v', 'quiet', '-print_format', 'json', '-show_streams', row.original_path],
          { timeout: 15_000 }
        );
        const data = JSON.parse(stdout);
        const v = (data.streams ?? []).find((s) => s.codec_type === 'video');
        const dur = v?.duration ? Number(v.duration) : null;
        if (dur && dur > 1) seek = '0.5';
      } catch {
        /* fall through with seek=0 */
      }
      await exec(
        'ffmpeg',
        [
          '-y',
          '-ss',
          seek,
          '-i',
          row.original_path,
          '-frames:v',
          '1',
          '-q:v',
          '4',
          '-f',
          'image2',
          row.thumb_path
        ],
        { timeout: 240_000 }
      );
      if (row.wall_path !== row.thumb_path) {
        await copyFile(row.thumb_path, row.wall_path);
      }

      // Encode the wall preview MP4 (mirrors makeWallPreview in video.ts).
      // Path lives next to the JPEG poster: <wall_dir>/<sha>.mp4.
      const wallDir = dirname(row.wall_path);
      const previewPath = `${wallDir}/${row.sha256}.mp4`;
      await safeUnlink(previewPath);
      await exec(
        'ffmpeg',
        [
          '-y',
          '-i', row.original_path,
          '-vf', "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '28',
          '-an',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          previewPath
        ],
        { timeout: 600_000 }
      );
    } else {
      const buf = await readFile(row.original_path);
      await sharp(buf)
        .rotate()
        .resize({
          width: GALLERY_MAX,
          height: GALLERY_MAX,
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(row.thumb_path);
      await sharp(buf)
        .rotate()
        .resize({
          width: WALL_MAX,
          height: WALL_MAX,
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toFile(row.wall_path);
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${rows.length}`);
  } catch (e) {
    failed++;
    console.error(`  ! ${row.id} (${row.mime}): ${e.message}`);
  }
}

await sql.end();
console.log(`done. ${done} regenerated, ${failed} failed.`);
