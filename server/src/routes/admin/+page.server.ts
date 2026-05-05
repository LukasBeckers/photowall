import type { PageServerLoad } from './$types';
import { desc } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { getSetting } from '$lib/server/settings';

export const load: PageServerLoad = async () => {
  const rows = await db
    .select({
      id: schema.photos.id,
      uploaderLabel: schema.photos.uploaderLabel,
      source: schema.photos.source,
      uploadedAt: schema.photos.uploadedAt,
      hiddenAt: schema.photos.hiddenAt,
      bytes: schema.photos.bytes,
      width: schema.photos.width,
      height: schema.photos.height
    })
    .from(schema.photos)
    .orderBy(desc(schema.photos.uploadedAt))
    .limit(500);

  const cellSize = await getSetting<number>('wall_cell_size', 200);

  return {
    photos: rows.map((r) => ({
      ...r,
      uploadedAt: r.uploadedAt.toISOString(),
      hiddenAt: r.hiddenAt?.toISOString() ?? null
    })),
    cellSize
  };
};
