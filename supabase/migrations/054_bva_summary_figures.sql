-- ============================================================
-- Odi MRP — Budget vs Actual: summary figures
-- Migration: 054_bva_summary_figures.sql
--
-- A flat, flexible store of monthly budget-vs-actual figures at the
-- summary grain Lance asked for: total revenue (D2C, Retail), orders
-- (D2C, Retail incl. Woolworths/rest), and indicative units by product
-- group. One row per (year_month, line_key).
--
--   line_key examples:
--     rev_d2c            — D2C revenue ($, gross customer sales)
--     rev_retail         — Retail revenue ($, wholesale = what Odi invoices)
--     ord_d2c            — D2C order count
--     ord_retail         — Retail order count (total)
--     ord_retail_ww      — Retail orders, Woolworths (actual only)
--     ord_retail_other   — Retail orders, other retailers (actual only)
--     units_sachets / units_tubs / units_snacks / units_pouches … (indicative)
--
-- budget = frozen plan figure; actual = uploaded from the monthly exports.
-- Closed months (month_locks) keep their original budget — re-importing a
-- closed month never overwrites its budget.
--
-- Seeds the validated May & June 2026 figures and locks both months.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.bva_figures (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month  date        NOT NULL,
  line_key    text        NOT NULL,
  budget      numeric(14, 2),
  actual      numeric(14, 2),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES public.user_profiles(id),
  UNIQUE (year_month, line_key)
);

CREATE INDEX IF NOT EXISTS idx_bva_figures_month ON public.bva_figures(year_month);

COMMENT ON TABLE public.bva_figures IS 'Budget-vs-actual summary figures per month: revenue, orders, indicative units by group. One row per (year_month, line_key).';

ALTER TABLE public.bva_figures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bva_figures_select" ON public.bva_figures;
CREATE POLICY "bva_figures_select" ON public.bva_figures FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bva_figures_write" ON public.bva_figures;
CREATE POLICY "bva_figures_write" ON public.bva_figures FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Seed validated May & June 2026 figures ────────────────────
INSERT INTO public.bva_figures (year_month, line_key, budget, actual) VALUES
  -- May 2026
  ('2026-05-01', 'rev_d2c',          74851, 57061),
  ('2026-05-01', 'rev_retail',       72747, 95086),
  ('2026-05-01', 'ord_d2c',            925,   701),
  ('2026-05-01', 'ord_retail',         222,   403),
  ('2026-05-01', 'ord_retail_ww',     NULL,   276),
  ('2026-05-01', 'ord_retail_other',  NULL,   127),
  ('2026-05-01', 'units_sachets',     4123,  1066),
  ('2026-05-01', 'units_tubs',        1635,   898),
  ('2026-05-01', 'units_snacks',      4018,  2120),
  ('2026-05-01', 'units_pouches',    18500, 16842),
  -- June 2026
  ('2026-06-01', 'rev_d2c',          91035, 50918),
  ('2026-06-01', 'rev_retail',       87786, 84703),
  ('2026-06-01', 'ord_d2c',           1125,   608),
  ('2026-06-01', 'ord_retail',         246,   418),
  ('2026-06-01', 'ord_retail_ww',     NULL,   258),
  ('2026-06-01', 'ord_retail_other',  NULL,   160),
  ('2026-06-01', 'units_sachets',     4697,   733),
  ('2026-06-01', 'units_tubs',        1973,   909),
  ('2026-06-01', 'units_snacks',      4885,  1671),
  ('2026-06-01', 'units_pouches',    22513, 17752)
ON CONFLICT (year_month, line_key) DO UPDATE
  SET budget = EXCLUDED.budget, actual = EXCLUDED.actual, updated_at = now();

-- Lock May & June (closed months — budget frozen to original).
INSERT INTO public.month_locks (year_month, notes) VALUES
  ('2026-05-01', 'Closed — original FY27 budget frozen'),
  ('2026-06-01', 'Closed — original FY27 budget frozen')
ON CONFLICT (year_month) DO NOTHING;

COMMIT;
