-- Rollback: Remove vector embeddings from course_offerings

-- Drop indexes
DROP INDEX IF EXISTS course_offerings_embedding_idx;
DROP INDEX IF EXISTS course_offerings_year_idx;
DROP INDEX IF EXISTS course_offerings_subject_id_idx;

-- Drop embedding column
ALTER TABLE course_offerings DROP COLUMN IF EXISTS embedding;

-- Drop extension (be careful - only if no other tables use it)
-- DROP EXTENSION IF EXISTS vector;
