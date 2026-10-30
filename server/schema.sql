-- Shared high scores (BRIEF: Cloudflare Worker + D1, free plan).
CREATE TABLE IF NOT EXISTS scores (
  id         TEXT PRIMARY KEY,
  client_id  TEXT UNIQUE,            -- the game's local entry id, so a retried upload is not counted twice
  name       TEXT NOT NULL,
  amount_ft  INTEGER NOT NULL,
  items      INTEGER NOT NULL,
  portrait   TEXT NOT NULL,          -- 128 × 128 PNG/JPEG data URL, under 20 KB
  created_at INTEGER NOT NULL,       -- ms since epoch
  imported   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (amount_ft DESC, created_at ASC);

-- One post per minute per IP. Only a salted hash of the IP is stored.
CREATE TABLE IF NOT EXISTS rate (
  ip_hash TEXT PRIMARY KEY,
  last_at INTEGER NOT NULL
);
