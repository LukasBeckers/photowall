import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  real,
  index,
  primaryKey
} from 'drizzle-orm/pg-core';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull()
});

export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(), // 'guest' | 'sdcard'
    uploaderId: uuid('uploader_id').references(() => sessions.id, { onDelete: 'set null' }),
    uploaderLabel: text('uploader_label').notNull(),
    sha256: text('sha256').notNull().unique(),
    originalPath: text('original_path').notNull(),
    thumbPath: text('thumb_path').notNull(),
    wallPath: text('wall_path').notNull(),
    mime: text('mime').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    takenAt: timestamp('taken_at', { withTimezone: true }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenReason: text('hidden_reason'),
    playbackSpeed: real('playback_speed').notNull().default(1)
  },
  (t) => ({
    uploadedAtIdx: index('photos_uploaded_at_idx').on(t.uploadedAt)
  })
);

export const reactions = pgTable(
  'reactions',
  {
    photoId: uuid('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.photoId, t.sessionId, t.emoji] })
  })
);

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
