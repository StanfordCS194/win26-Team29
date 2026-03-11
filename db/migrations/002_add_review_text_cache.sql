-- Migration: Add review_text column to course_offerings for combined semantic search
-- Caches aggregated student review text for embedding generation and snippet extraction
-- Idempotent: safe to run multiple times

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'course_offerings' AND column_name = 'review_text'
  ) THEN
    ALTER TABLE course_offerings ADD COLUMN review_text text;
  END IF;
END $;
