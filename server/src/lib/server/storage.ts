import { mkdir, rename, writeFile, stat } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DATA_DIR = process.env.DATA_DIR ?? '/data';

export const PATHS = {
  data: DATA_DIR,
  originals: join(DATA_DIR, 'originals'),
  thumbs: join(DATA_DIR, 'thumbs'),
  wall: join(DATA_DIR, 'wall'),
  tmp: join(DATA_DIR, 'tmp')
};

export async function ensureDirs() {
  await mkdir(PATHS.originals, { recursive: true });
  await mkdir(PATHS.thumbs, { recursive: true });
  await mkdir(PATHS.wall, { recursive: true });
  await mkdir(PATHS.tmp, { recursive: true });
}

// Stream incoming bytes into a temp file while computing the sha256 along the way.
// Returns the temp path, hash, and total bytes written.
export async function streamToTemp(
  body: ReadableStream<Uint8Array> | Buffer
): Promise<{ tempPath: string; sha256: string; bytes: number }> {
  await ensureDirs();
  const tempName = `${Date.now()}-${randomBytes(8).toString('hex')}`;
  const tempPath = join(PATHS.tmp, tempName);
  const hash = createHash('sha256');
  let bytes = 0;

  const out = createWriteStream(tempPath);
  if (Buffer.isBuffer(body)) {
    hash.update(body);
    bytes += body.length;
    await new Promise<void>((res, rej) => {
      out.write(body, (err) => (err ? rej(err) : res()));
    });
    await new Promise<void>((res) => out.end(res));
  } else {
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        hash.update(chunk);
        bytes += chunk.byteLength;
        controller.enqueue(chunk);
      }
    });
    const piped = body.pipeThrough(transform);
    await pipeline(Readable.fromWeb(piped as any), out);
  }

  return { tempPath, sha256: hash.digest('hex'), bytes };
}

// Final destination path for an original file, organized by yyyy-mm.
export function originalPathFor(sha256: string, ext: string, uploadedAt: Date = new Date()): string {
  const yyyy = uploadedAt.getUTCFullYear();
  const mm = String(uploadedAt.getUTCMonth() + 1).padStart(2, '0');
  const folder = `${yyyy}-${mm}`;
  return join(PATHS.originals, folder, `${sha256}${ext}`);
}

export async function moveToOriginal(tempPath: string, finalPath: string): Promise<void> {
  await mkdir(dirname(finalPath), { recursive: true });
  await rename(tempPath, finalPath);
}

export function thumbPathFor(sha256: string): string {
  return join(PATHS.thumbs, `${sha256}.jpg`);
}

export function wallPathFor(sha256: string): string {
  return join(PATHS.wall, `${sha256}.jpg`);
}

export async function writeFileSafe(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function streamFile(path: string): NodeJS.ReadableStream {
  return createReadStream(path);
}
