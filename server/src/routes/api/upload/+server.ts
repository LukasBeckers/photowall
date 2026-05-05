import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ingestPhoto, IngestError } from '$lib/server/photos';
import { allow, clientIp } from '$lib/server/ratelimit';

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  if (!locals.session) throw error(401, 'Unauthorized');

  const ip = clientIp(request, getClientAddress);
  if (!allow('upload', ip, { capacity: 60, refillPerSec: 60 / 300 })) {
    throw error(429, 'Too many uploads, slow down for a few minutes.');
  }

  const form = await request.formData();
  const files = form.getAll('files').filter((v): v is File => v instanceof File);
  if (files.length === 0) throw error(400, 'No files provided');
  if (files.length > 20) throw error(400, 'Too many files in one request (max 20)');

  const results: Array<{ id: string; duplicate: boolean; name: string }> = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const f of files) {
    try {
      const r = await ingestPhoto({
        filename: f.name,
        mime: f.type || 'application/octet-stream',
        body: f.stream(),
        source: 'guest',
        uploaderId: locals.session.id,
        uploaderLabel: locals.session.displayName
      });
      results.push({ id: r.id, duplicate: r.duplicate, name: f.name });
    } catch (e) {
      const msg = e instanceof IngestError ? e.message : (e as Error).message;
      errors.push({ name: f.name, error: msg });
    }
  }

  return json({ uploaded: results, errors });
};
