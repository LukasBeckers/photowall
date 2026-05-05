import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';

export async function GET() {
  await db.execute(sql`SELECT 1`);
  return json({ ok: true });
}
