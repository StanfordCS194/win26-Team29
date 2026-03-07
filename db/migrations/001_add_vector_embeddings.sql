-- Migration: Add vector embeddings to course_offerings for semantic search
-- Idempotent: safe to run multiple times

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to course_offerings (384 dimensions for all-MiniLM-L6-v2)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'course_offerings' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE course_offerings ADD COLUMN embedding vector(384);
  END IF;
END $$;

-- Create index for cosine similarity search
-- Using ivfflat since we have ~5000 courses (good for datasets < 1M)
CREATE INDEX IF NOT EXISTS course_offerings_embedding_idx
ON course_offerings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Optional: Add index for faster filtering during vector search
CREATE INDEX IF NOT EXISTS course_offerings_year_idx ON course_offerings(year);
CREATE INDEX IF NOT EXISTS course_offerings_subject_id_idx ON course_offerings(subject_id);
