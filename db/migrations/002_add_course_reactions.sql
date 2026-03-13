-- Migration: Add course_reactions table for per-user like/dislike on courses
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS public.course_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_code text NOT NULL,
  reaction    text NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_code)
);

CREATE INDEX IF NOT EXISTS course_reactions_course_code_idx ON public.course_reactions (course_code);
CREATE INDEX IF NOT EXISTS course_reactions_user_id_idx     ON public.course_reactions (user_id);

ALTER TABLE public.course_reactions ENABLE ROW LEVEL SECURITY;

-- Policies (drop first so the script is re-runnable)
DO $$
BEGIN
  DROP POLICY IF EXISTS course_reactions_select ON public.course_reactions;
  DROP POLICY IF EXISTS course_reactions_insert ON public.course_reactions;
  DROP POLICY IF EXISTS course_reactions_update ON public.course_reactions;
  DROP POLICY IF EXISTS course_reactions_delete ON public.course_reactions;
END $$;

-- Users can read all reactions (for aggregate counts)
CREATE POLICY course_reactions_select
  ON public.course_reactions FOR SELECT USING (true);

-- Users can only insert/update/delete their own reactions
CREATE POLICY course_reactions_insert
  ON public.course_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY course_reactions_update
  ON public.course_reactions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY course_reactions_delete
  ON public.course_reactions FOR DELETE USING (auth.uid() = user_id);
