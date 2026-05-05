import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { issueToken } from '$lib/server/token';
import { renderQrSvg } from '$lib/server/qr';

export const POST: RequestHandler = async ({ request, locals, url }) => {
  if (!locals.admin) throw error(403, 'Forbidden');

  const body = (await request.json().catch(() => ({}))) as { label?: unknown };
  const label = typeof body.label === 'string' ? body.label.slice(0, 40) : 'entrance';

  const token = issueToken({ label });
  const base = `${url.protocol}//${url.host}`;
  const fullUrl = `${base}/login?t=${token}`;
  const qr = await renderQrSvg(fullUrl);
  return json({ token, url: fullUrl, qr });
};
