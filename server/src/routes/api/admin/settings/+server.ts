import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllSettings, putSetting } from '$lib/server/settings';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.admin) throw error(403, 'Forbidden');
  const settings = await getAllSettings();
  return json({ settings });
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  if (!locals.admin) throw error(403, 'Forbidden');
  const body = (await request.json().catch(() => ({}))) as { key?: unknown; value?: unknown };
  const key = typeof body.key === 'string' ? body.key : '';
  if (!key) throw error(400, 'Missing key');

  // Per-key validation. Settings are intentionally limited so the admin can't
  // type arbitrary payloads into the wall.
  if (key === 'wall_cell_size') {
    const v = Number(body.value);
    if (!Number.isFinite(v) || v < 60 || v > 1200) throw error(400, 'cell size out of range');
    await putSetting(key, Math.round(v));
  } else if (key === 'wall_max_cells') {
    const v = Number(body.value);
    if (!Number.isFinite(v) || v < 4 || v > 200) throw error(400, 'max cells out of range');
    await putSetting(key, Math.round(v));
  } else {
    throw error(400, 'Unknown setting');
  }

  return json({ ok: true });
};
