-- Per-video playback speed multiplier. 1.0 = normal speed.
-- Defaults applies retroactively to existing rows; for non-video photos the
-- value is meaningless but harmless to carry.
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS playback_speed real NOT NULL DEFAULT 1.0;
