-- =============================================================================
-- STEP 2: course_offerings_full_mv
-- =============================================================================
--
-- All commands below assume you are in the scrape/ folder.
--
-- Run with psql and a database URL:
--
--   psql "$DATABASE_URL" -f sql/course_offerings_full_mv.sql
--
-- Using .env (DATABASE_URL=postgresql://... in scrape/.env):
--
--   set -a && source .env && set +a && psql "$DATABASE_URL" -f sql/course_offerings_full_mv.sql
--
-- Or with npx (loads .env then runs psql):
--
--   npx dotenv -e .env -- bash -c 'psql "$DATABASE_URL" -f sql/course_offerings_full_mv.sql'
--
-- Or with URL inline:
--
--   psql "postgresql://user:password@host:port/dbname" -f sql/course_offerings_full_mv.sql
--
-- (This script sets statement_timeout = '25min' internally.)
--
-- =============================================================================
set statement_timeout = '25min';
DROP MATERIALIZED VIEW IF EXISTS course_offerings_full_mv CASCADE;

CREATE MATERIALIZED VIEW course_offerings_full_mv AS
WITH

offering_gers AS (
  SELECT
    cog.course_offering_id,
    array_agg(g.code ORDER BY g.code) AS gers
  FROM course_offering_gers cog
  JOIN gers g ON g.id = cog.ger_id
  GROUP BY cog.course_offering_id
),

offering_tags AS (
  SELECT
    cot.course_offering_id,
    jsonb_agg(
      jsonb_build_object(
        'organization', cot.organization,
        'name',         cot.name
      ) ORDER BY cot.organization, cot.name
    ) AS tags
  FROM course_offering_tags cot
  GROUP BY cot.course_offering_id
),

offering_attrs AS (
  SELECT
    coa.course_offering_id,
    jsonb_agg(
      jsonb_build_object(
        'name',          coa.name,
        'value',         coa.value,
        'description',   coa.description,
        'schedulePrint', coa.schedule_print
      ) ORDER BY coa.name
    ) AS attributes
  FROM course_offering_attributes coa
  GROUP BY coa.course_offering_id
),

offering_los AS (
  SELECT
    lo.course_offering_id,
    jsonb_agg(
      jsonb_build_object(
        'requirementCode', lo.requirement_code,
        'description',     lo.description
      ) ORDER BY lo.requirement_code
    ) AS learning_objectives
  FROM learning_objectives lo
  GROUP BY lo.course_offering_id
),

schedule_instructors_agg AS (
  SELECT
    si.schedule_id,
    jsonb_agg(
      jsonb_build_object(
        'instructorId', i.id,
        'name',         i.name,
        'firstName',    i.first_name,
        'middleName',   i.middle_name,
        'lastName',     i.last_name,
        'sunet',        i.sunet,
        'role',         ir.code
      ) ORDER BY ir.code, i.last_name, i.first_name
    ) AS instructors
  FROM schedule_instructors si
  JOIN instructors i       ON i.id  = si.instructor_id
  JOIN instructor_roles ir ON ir.id = si.instructor_role_id
  GROUP BY si.schedule_id
),

section_schedules_agg AS (
  SELECT
    sch.section_id,
    jsonb_agg(
      jsonb_build_object(
        'scheduleId',  sch.id,
        'startDate',   sch.start_date,
        'endDate',     sch.end_date,
        'startTime',   sch.start_time,
        'endTime',     sch.end_time,
        'location',    sch.location,
        'days',        to_jsonb(sch.days),
        'instructors', COALESCE(sia.instructors, '[]'::jsonb)
      ) ORDER BY sch.start_date, sch.start_time
    ) AS schedules
  FROM schedules sch
  LEFT JOIN schedule_instructors_agg sia ON sia.schedule_id = sch.id
  GROUP BY sch.section_id
),

section_attrs_agg AS (
  SELECT
    sa.section_id,
    jsonb_agg(
      jsonb_build_object(
        'name',          sa.name,
        'value',         sa.value,
        'description',   sa.description,
        'schedulePrint', sa.schedule_print
      ) ORDER BY sa.name
    ) AS attributes
  FROM section_attributes sa
  GROUP BY sa.section_id
),

section_evals_agg AS (
  SELECT
    esa.section_id,
    jsonb_agg(
      jsonb_build_object(
        'question',  enq.question_text,
        'smartAverage',     esa.smart_average,
        'isCourseInformed', esa.is_course_informed,
        'isInstructorInformed', esa.is_instructor_informed
      ) ORDER BY enq.question_text
    ) AS smart_evaluations
  FROM evaluation_smart_averages esa
  JOIN evaluation_numeric_questions enq ON enq.id = esa.question_id
  GROUP BY esa.section_id
),

offering_sections AS (
  SELECT
    sec.course_offering_id,
    jsonb_agg(
      jsonb_build_object(
        'sectionId',           sec.id,
        'classId',             sec.class_id,
        'sectionNumber',       sec.section_number,
        'termQuarter',         sec.term_quarter,
        'termId',              sec.term_id,
        'componentType',       ct.code,
        'unitsMin',            sec.units_min,
        'unitsMax',            sec.units_max,
        'numEnrolled',         sec.num_enrolled,
        'maxEnrolled',         sec.max_enrolled,
        'numWaitlist',         sec.num_waitlist,
        'maxWaitlist',         sec.max_waitlist,
        'enrollStatus',        es.code,
        'addConsent',          ac.code,
        'dropConsent',         dc.code,
        'currentClassSize',    sec.current_class_size,
        'maxClassSize',        sec.max_class_size,
        'currentWaitlistSize', sec.current_waitlist_size,
        'maxWaitlistSize',     sec.max_waitlist_size,
        'notes',               sec.notes,
        'cancelled',           sec.cancelled,
        'attributes',          COALESCE(saa.attributes, '[]'::jsonb),
        'schedules',           COALESCE(ssa.schedules, '[]'::jsonb),
        'smartEvaluations',    COALESCE(sea.smart_evaluations, '[]'::jsonb)
      ) ORDER BY sec.term_quarter, sec.section_number
    ) AS sections
  FROM sections sec
  JOIN component_types ct    ON ct.id = sec.component_type_id
  JOIN enroll_statuses es    ON es.id = sec.enroll_status_id
  JOIN consent_options ac    ON ac.id = sec.add_consent_id
  JOIN consent_options dc    ON dc.id = sec.drop_consent_id
  LEFT JOIN section_schedules_agg ssa ON ssa.section_id = sec.id
  LEFT JOIN section_attrs_agg saa     ON saa.section_id = sec.id
  LEFT JOIN section_evals_agg sea     ON sea.section_id = sec.id
  GROUP BY sec.course_offering_id
)

SELECT
  co.id                       AS offering_id,
  co.course_id,
  co.year,
  co.offer_number,
  s.code                      AS subject_code,
  s.longname                  AS subject_longname,
  co.code_number,
  co.code_suffix,
  co.title,
  co.description,
  co.repeatable,
  co.units_min,
  co.units_max,
  co.max_units_repeat,
  co.max_times_repeat,
  co.schedule_print,
  co.created_at,
  go2.code                    AS grading_option,
  feo.code                    AS final_exam_flag,
  ag.code                     AS academic_group,
  ac.code                     AS academic_career,
  ao.code                     AS academic_organization,
  COALESCE(og.gers, '{}')                       AS gers,
  COALESCE(ot.tags, '[]'::jsonb)                 AS tags,
  COALESCE(oa.attributes, '[]'::jsonb)           AS attributes,
  COALESCE(olo.learning_objectives, '[]'::jsonb) AS learning_objectives,
  COALESCE(os.sections, '[]'::jsonb)             AS sections
FROM course_offerings co
JOIN subjects s                    ON s.id  = co.subject_id
JOIN grading_options go2           ON go2.id = co.grading_option_id
JOIN final_exam_options feo        ON feo.id = co.final_exam_flag_id
JOIN academic_groups ag            ON ag.id  = co.academic_group_id
JOIN academic_careers ac           ON ac.id  = co.academic_career_id
JOIN academic_organizations ao     ON ao.id  = co.academic_organization_id
LEFT JOIN offering_gers og         ON og.course_offering_id  = co.id
LEFT JOIN offering_tags ot         ON ot.course_offering_id  = co.id
LEFT JOIN offering_attrs oa        ON oa.course_offering_id  = co.id
LEFT JOIN offering_los olo         ON olo.course_offering_id = co.id
LEFT JOIN offering_sections os     ON os.course_offering_id  = co.id;

CREATE UNIQUE INDEX idx_cofull_mv_pk
  ON course_offerings_full_mv (offering_id);

-- Verify
SELECT count(*) AS total_offerings FROM course_offerings_full_mv;

SELECT offering_id, subject_code, code_number, title,
       jsonb_array_length(sections) AS num_sections,
       array_length(gers, 1) AS num_gers
FROM course_offerings_full_mv
ORDER BY offering_id
LIMIT 5;