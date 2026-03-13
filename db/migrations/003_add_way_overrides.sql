-- Migration: Add way_overrides JSONB column to plans table
-- Stores per-user WAYS attribution overrides: courseCode → wayCode

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS way_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
