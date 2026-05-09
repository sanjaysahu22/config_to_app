-- ═══════════════════════════════════════════════════════
-- Auto-generated migration
-- Generated: 2026-05-08T14:52:27.395Z
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
