-- ============================================================
-- Odi MRP — Planning start month
-- Migration: 013_planning_start_month.sql
--
-- Adds a singleton "planning start month" setting. When set, all
-- rolling 12-month views (Demand, Production, Ingredient demand)
-- start from this month instead of today's calendar month. Used to
-- "complete" a month and shift the planning window forward.
-- Null means: use today's calendar month (default behaviour).
-- ============================================================

BEGIN;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS planning_start_month date;

COMMENT ON COLUMN public.app_settings.planning_start_month IS
  'First month of the rolling 12-month planning window. Null = use today''s calendar month. Stored as the first day of the month (e.g. 2026-05-01).';

COMMIT;
