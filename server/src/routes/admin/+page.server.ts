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
  const maxCells = await getSetting<number>('wall_max_cells', 40);
  const slideshowMode = await getSetting<string>('wall_slideshow_mode', 'off');
  const slideshowSeconds = await getSetting<number>('wall_slideshow_seconds', 6);
  const autoMosaicMin = await getSetting<number>('wall_auto_mosaic_min', 5);
  const autoSlideshowMin = await getSetting<number>('wall_auto_slideshow_min', 5);

  return {
    photos: rows.map((r) => ({
      ...r,
      uploadedAt: r.uploadedAt.toISOString(),
      hiddenAt: r.hiddenAt?.toISOString() ?? null
    })),
    cellSize,
    maxCells,
    slideshowMode,
    slideshowSeconds,
    autoMosaicMin,
    autoSlideshowMin
  };
};
