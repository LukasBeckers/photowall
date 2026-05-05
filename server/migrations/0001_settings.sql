CREATE TABLE IF NOT EXISTS "settings" (
  "key" text PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

INSERT INTO "settings" ("key", "value") VALUES ('wall_cell_size', '200'::jsonb)
  ON CONFLICT ("key") DO NOTHING;
