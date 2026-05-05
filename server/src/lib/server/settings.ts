// Tiny key-value settings store backed by a JSONB column.
// Reads are cheap (one row); writes broadcast a SSE event so connected wall
// clients can react live.
import { sql } from 'drizzle-orm';
import { db } from './db';
import { hub } from './sse';

// db.execute() returns raw driver rows. postgres-js returns JSONB columns as
// strings, so we JSON.parse them on the way out.
function parseJsonb(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = (await db.execute(
    sql`SELECT value FROM settings WHERE key = ${key}`
  )) as unknown as Array<{ value: unknown }>;
  if (rows.length === 0) return fallback;
  return parseJsonb(rows[0].value) as T;
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  await db.execute(sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `);
  const all = await getAllSettings();
  hub.broadcast({ type: 'settings.changed', settings: all });
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = (await db.execute(
    sql`SELECT key, value FROM settings`
  )) as unknown as Array<{ key: string; value: unknown }>;
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = parseJsonb(r.value);
  return out;
}
