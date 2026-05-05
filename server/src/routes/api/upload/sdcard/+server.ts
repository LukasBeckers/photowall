import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ingestPhoto, IngestError } from '$lib/server/photos';
import { checkWatcherToken } from '$lib/server/auth';

// Watcher uploads use a raw body (Content-Type: image/...) rather than multipart
// form-data, so they don't trigger SvelteKit's form-origin CSRF check. The
// watcher authenticates with a bearer token instead.
export const POST: RequestHandler = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw error(401, 'Missing bearer token');
  if (!checkWatcherToken(auth.slice('Bearer '.length))) throw error(401, 'Bad token');

  const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  const filename = (request.headers.get('x-filename') ?? 'sdcard-upload').slice(0, 200);
  const label = (request.headers.get('x-label') ?? 'Camera (SD card)').slice(0, 60);

  const body = request.body;
  if (!body) throw error(400, 'Empty body');

  try {
    const r = await ingestPhoto({
      filename,
      mime,
      body,
      source: 'sdcard',
      uploaderId: null,
      uploaderLabel: label
    });
    return json({ id: r.id, duplicate: r.duplicate });
  } catch (e) {
    if (e instanceof IngestError) throw error(e.status, e.message);
    throw e;
  }
};
