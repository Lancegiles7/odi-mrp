-- ============================================================
-- Month-to-date (interim) sales for Stockout Watch.
--
-- The mid-month sellout review needs PROVISIONAL sales for the current, still-
-- open month (e-com pulled from Shopify + retail from the Upstock export). These
-- are deliberately kept OUT of product_actuals so they never pollute the final
-- monthly figures the Summary grid and Budget vs Actual read — a month's actuals
-- are only written once it's closed.
--
-- One row per product × channel × as-of snapshot. Stockout Watch reads the latest
-- snapshot (max as_of_date) for the current period and run-rates it over the days
-- elapsed. A new pull/upload replaces the period's rows.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.interim_sales (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  channel      text NOT NULL,                 -- nz_d2c | au_d2c | nz_retail | au_retail | nz_samples ...
  units        numeric NOT NULL DEFAULT 0,
  period_start date NOT NULL,                  -- first day of the month this covers (e.g. 2026-10-01)
  as_of_date   date NOT NULL,                  -- the MTD cut-off the figures run to
  source       text,                           -- 'shopify' | 'upstock' | 'manual'
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, channel, period_start, as_of_date)
);

CREATE INDEX IF NOT EXISTS interim_sales_period_idx
  ON public.interim_sales (period_start, as_of_date);

ALTER TABLE public.interim_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interim_sales_rw ON public.interim_sales;
CREATE POLICY interim_sales_rw ON public.interim_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
