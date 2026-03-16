-- Rollback: Remove review_text column from course_offerings

ALTER TABLE course_offerings DROP COLUMN IF EXISTS review_text;
