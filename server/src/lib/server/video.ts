// Video metadata + poster-frame extraction via ffmpeg/ffprobe. Same return
// shape as `makeThumbnails` so the upload pipeline can branch on mime without
// further changes downstream.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { thumbPathFor, wallPathFor, fileExists } from './storage';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const exec = promisify(execFile);

export interface VideoPosterResult {
  width: number;
  height: number;
  thumbPath: string;
  wallPath: string;
  takenAt: Date | null;
}

interface FFProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: Record<string, string>;
}

/**
 * Extract a single JPEG frame from the video to use as a poster + gallery
 * thumbnail. We don't keep separate "wall" and "thumb" sizes for video — the
 * wall element plays the original directly, so a 1280-wide poster is plenty
 * for both the gallery card and the brief moment before the video starts.
 */
export async function makeVideoPosters(
  originalPath: string,
  sha256: string
): Promise<VideoPosterResult> {
  const thumbPath = thumbPathFor(sha256);
  const wallPath = wallPathFor(sha256);

  const { width, height, duration } = await probe(originalPath);

  // Extract one frame. Seek before -i for fast keyframe seek; clamp the seek
  // point if the clip is shorter than 1s.
  const seek = duration && duration > 1 ? '0.5' : '0';

  await mkdir(dirname(thumbPath), { recursive: true });
  if (!(await fileExists(thumbPath))) {
    await runFfmpeg([
      '-y',
      '-ss',
      seek,
      '-i',
      originalPath,
      '-frames:v',
      '1',
      '-q:v',
      '4',
      '-f',
      'image2',
      thumbPath
    ]);
  }
  // Wall poster is the same JPEG — saves a redundant ffmpeg invocation.
  if (wallPath !== thumbPath && !(await fileExists(wallPath))) {
    const { copyFile } = await import('node:fs/promises');
    await mkdir(dirname(wallPath), { recursive: true });
    await copyFile(thumbPath, wallPath);
  }

  return {
    width,
    height,
    thumbPath,
    wallPath,
    takenAt: null
  };
}

async function probe(
  path: string
): Promise<{ width: number; height: number; duration: number | null }> {
  const { stdout } = await exec(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_streams', path],
    { timeout: 15_000 }
  );
  const data = JSON.parse(stdout) as { streams?: FFProbeStream[] };
  const video = (data.streams ?? []).find((s) => s.codec_type === 'video');
  if (!video) throw new Error('no video stream');
  const w = Number(video.width ?? 0);
  const h = Number(video.height ?? 0);
  if (!w || !h) throw new Error('video has no dimensions');
  const duration = video.duration ? Number(video.duration) : null;
  return { width: w, height: h, duration: Number.isFinite(duration) ? duration : null };
}

async function runFfmpeg(args: string[]): Promise<void> {
  await exec('ffmpeg', args, { timeout: 60_000 });
}
