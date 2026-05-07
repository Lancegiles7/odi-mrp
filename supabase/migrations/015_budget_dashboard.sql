-- ============================================================
-- Odi MRP — Budget dashboard
-- Migration: 015_budget_dashboard.sql
--
-- Two tables to hold uploads of the FY budget spreadsheet:
--   • budget_snapshots   — one row per uploaded XLSX. Latest is_current
--                          row drives the dashboard.
--   • budget_line_items  — flattened key-value rows extracted from
--                          the spreadsheet (P&L line items, D2C orders,
--                          retail active stores, etc.)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. SNAPSHOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_snapshots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_filename text        NOT NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  uploaded_by     uuid        REFERENCES public.user_profiles(id),
  is_current      boolean     NOT NULL DEFAULT false,
  notes           text
);

-- Only one current snapshot at a time. Setting is_current=true clears the others.
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_snapshots_current_unique
  ON public.budget_snapshots ((true)) WHERE is_current = true;

COMMENT ON TABLE public.budget_snapshots IS 'One row per uploaded FY budget XLSX. Only one row has is_current=true; that row drives the dashboard.';


-- ============================================================
-- 2. LINE ITEMS — flattened key-value rows
--   section:    'pnl' | 'd2c' | 'retail'
--   metric:     line-item code (e.g. 'net_revenue', 'orders', 'active_stores')
--   region:     'nz' | 'au' | 'total'
--   channel:    for retail — 'woolworths' | 'grocery' | 'pharmacy' | 'other' | 'all'
--               for d2c    — null
--   year_month: first day of the month (e.g. 2026-04-01) — null for FY totals
--   fiscal_year:e.g. 27, 28, 29 — only set on FY-total rows
--   value:      numeric (units, dollars, percent — context from metric)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_line_items (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid    NOT NULL REFERENCES public.budget_snapshots(id) ON DELETE CASCADE,
  section     text    NOT NULL CHECK (section IN ('pnl', 'd2c', 'retail')),
  metric      text    NOT NULL,
  region      text    NOT NULL CHECK (region IN ('nz', 'au', 'total')),
  channel     text,
  year_month  date,
  fiscal_year integer,
  value       numeric,

  CHECK ((year_month IS NOT NULL) OR (fiscal_year IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_budget_line_items_snapshot ON public.budget_line_items(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_budget_line_items_lookup
  ON public.budget_line_items(snapshot_id, section, metric, region);

COMMENT ON TABLE public.budget_line_items IS 'Flattened budget data extracted from the snapshot XLSX. Keyed by (section, metric, region, channel, period).';


-- ============================================================
-- RLS — admins write, all authenticated users read
-- ============================================================
ALTER TABLE public.budget_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_snapshots_select_authenticated" ON public.budget_snapshots;
CREATE POLICY "budget_snapshots_select_authenticated"
  ON public.budget_snapshots FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "budget_snapshots_write_authenticated" ON public.budget_snapshots;
CREATE POLICY "budget_snapshots_write_authenticated"
  ON public.budget_snapshots FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "budget_line_items_select_authenticated" ON public.budget_line_items;
CREATE POLICY "budget_line_items_select_authenticated"
  ON public.budget_line_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "budget_line_items_write_authenticated" ON public.budget_line_items;
CREATE POLICY "budget_line_items_write_authenticated"
  ON public.budget_line_items FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

COMMIT;
