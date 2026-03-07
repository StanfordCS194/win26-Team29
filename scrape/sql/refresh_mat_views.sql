-- =============================================================================
-- refresh_mat_views.sql
-- =============================================================================
--
-- Refresh all materialized views concurrently.
--
-- All commands below assume you are in the scrape/ folder.
--
-- Run with psql and a database URL:
--
--   psql "$DATABASE_URL" -f sql/refresh_mat_views.sql
--
-- Using .env (DATABASE_URL=postgresql://... in scrape/.env):
--
--   set -a && source .env && set +a && psql "$DATABASE_URL" -f sql/refresh_mat_views.sql
--
-- Or with npx (loads .env then runs psql):
--
--   npx dotenv -e .env -- bash -c 'psql "$DATABASE_URL" -f sql/refresh_mat_views.sql'
--
-- Or with URL inline:
--
--   psql "postgresql://user:password@host:port/dbname" -f sql/refresh_mat_views.sql
--
-- (This script sets statement_timeout = '25min' internally.)
--
-- =============================================================================

SET statement_timeout = '25min';

-- Refresh materialized views concurrently
-- Order respects dependencies

REFRESH MATERIALIZED VIEW CONCURRENTLY public.course_content_search;

REFRESH MATERIALIZED VIEW CONCURRENTLY public.offering_aggregates_mv;

REFRESH MATERIALIZED VIEW CONCURRENTLY public.section_instructor_sunets_mv;

REFRESH MATERIALIZED VIEW CONCURRENTLY public.crosslistings_mv;

REFRESH MATERIALIZED VIEW CONCURRENTLY public.course_enrollment_trends_mv;

-- Depends on offering_aggregates_mv
REFRESH MATERIALIZED VIEW CONCURRENTLY public.course_offerings_full_mv;