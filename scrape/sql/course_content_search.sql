-- =============================================================================
-- course_content_search
-- =============================================================================
--
-- Full-text search materialized view for course offerings.
-- Combines course code, title, subject, cross-listings, instructors,
-- description, and AI-generated search tags into a single tsvector.
--
-- All commands below assume you are in the scrape/ folder.
--
-- Run with psql and a database URL:
--
--   psql "$DATABASE_URL" -f sql/course_content_search.sql
--
-- Using .env (DATABASE_URL=postgresql://... in scrape/.env):
--
--   set -a && source .env && set +a && psql "$DATABASE_URL" -f sql/course_content_search.sql
--
-- Or with npx (loads .env then runs psql):
--
--   npx dotenv -e .env -- bash -c 'psql "$DATABASE_URL" -f sql/course_content_search.sql'
--
-- (This script sets statement_timeout = '25min' internally.)
--
-- =============================================================================

SET statement_timeout = '25min';

DROP MATERIALIZED VIEW IF EXISTS public.course_content_search;

CREATE MATERIALIZED VIEW public.course_content_search AS
SELECT
    co.id AS offering_id,
    co.year,
    (
        -- MAIN COURSE CODE (highest priority)
        setweight(
            to_tsvector(
                'simple',
                s.code || ' ' || co.code_number::text || COALESCE(co.code_suffix, '')
            ),
            'A'
        ) ||

        -- TITLE
        setweight(to_tsvector('english', co.title_clean), 'A') ||

        -- SUBJECT LONG NAME
        setweight(to_tsvector('english', COALESCE(s.longname, '')), 'C') ||

        -- CROSS LISTINGS
        setweight(
            to_tsvector(
                'simple',
                COALESCE(string_agg(DISTINCT xl.code_str, ' '), '')
            ),
            'C'
        ) ||

        -- INSTRUCTORS
        setweight(
            to_tsvector(
                'simple',
                COALESCE(string_agg(DISTINCT instr.first_and_last_name, ' '), '')
            ),
            'A'
        ) ||

        -- DESCRIPTION
        setweight(to_tsvector('english', co.description), 'C') ||

        -- SEARCH TAGS (AI-generated topic terms + variants)
        setweight(to_tsvector('english', COALESCE(tags.tags_text, '')), 'C') ||
        setweight(to_tsvector('simple',  COALESCE(tags.tags_text, '')), 'A')
    ) AS search_vector
FROM course_offerings co
JOIN subjects s ON s.id = co.subject_id

LEFT JOIN (
    SELECT
        co2.id AS course_offering_id,
        s2.code || ' ' || co2.code_number::text || COALESCE(co2.code_suffix, '') AS code_str
    FROM course_offerings co2
    JOIN subjects s2 ON s2.id = co2.subject_id
    JOIN course_offerings co3
        ON co3.course_id = co2.course_id
       AND co3.year = co2.year
       AND co3.id != co2.id
) xl ON xl.course_offering_id = co.id

LEFT JOIN (
    SELECT
        sec2.course_offering_id,
        i2.id,
        i2.first_and_last_name
    FROM sections sec2
    JOIN schedules sch2 ON sch2.section_id = sec2.id
    JOIN schedule_instructors si2 ON si2.schedule_id = sch2.id
    JOIN instructors i2 ON i2.id = si2.instructor_id
    WHERE sec2.is_principal = true
      AND sec2.cancelled = false
    GROUP BY sec2.course_offering_id, i2.id, i2.first_and_last_name
) instr ON instr.course_offering_id = co.id

LEFT JOIN (
    SELECT
        ost.course_offering_id,
        string_agg(
            trim(ost.term || ' ' || COALESCE(array_to_string(ost.variants, ' '), '')),
            ' '
        ) AS tags_text
    FROM offering_search_tags ost
    GROUP BY ost.course_offering_id
) tags ON tags.course_offering_id = co.id

GROUP BY
    co.id,
    co.year,
    co.code_number,
    co.code_suffix,
    co.title_clean,
    co.description,
    s.code,
    s.longname,
    tags.tags_text;

CREATE UNIQUE INDEX IF NOT EXISTS course_content_search_offering_id_idx
    ON public.course_content_search (offering_id);

CREATE INDEX IF NOT EXISTS course_content_search_year_idx
    ON public.course_content_search (year);

CREATE INDEX IF NOT EXISTS course_content_search_vector_idx
    ON public.course_content_search USING GIN (search_vector);
