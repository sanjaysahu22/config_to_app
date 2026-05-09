-- ═══════════════════════════════════════════════════════
-- Auto-generated migration
-- Generated: 2026-05-08T14:53:14.011Z
-- Run: psql $DATABASE_URL -f migration.sql
-- ═══════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy text search

-- Auto-update updated_at trigger function (shared)
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Task ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  status TEXT DEFAULT ''todo'',
  createdAt TIMESTAMPTZ DEFAULT 'now()',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_task_updated_at
  BEFORE UPDATE ON task
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_task_search
  ON task USING GIN (to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(status, '')));
