CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "display_name" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" text NOT NULL,
  "uploader_id" uuid REFERENCES "sessions"("id") ON DELETE SET NULL,
  "uploader_label" text NOT NULL,
  "sha256" text NOT NULL UNIQUE,
  "original_path" text NOT NULL,
  "thumb_path" text NOT NULL,
  "wall_path" text NOT NULL,
  "mime" text NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "bytes" bigint NOT NULL,
  "taken_at" timestamptz,
  "uploaded_at" timestamptz DEFAULT now() NOT NULL,
  "hidden_at" timestamptz,
  "hidden_reason" text,
  CONSTRAINT photos_source_chk CHECK ("source" IN ('guest', 'sdcard'))
);

CREATE INDEX IF NOT EXISTS "photos_uploaded_at_idx"
  ON "photos" ("uploaded_at" DESC)
  WHERE "hidden_at" IS NULL;

CREATE TABLE IF NOT EXISTS "reactions" (
  "photo_id" uuid NOT NULL REFERENCES "photos"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "emoji" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("photo_id", "session_id", "emoji")
);

CREATE INDEX IF NOT EXISTS "reactions_photo_idx" ON "reactions" ("photo_id");
