-- ============================================================
-- Expo / event (POS) sales, per product × market × month.
--
-- Pop-up expo sales run through Shopify POS event locations and are NOT part of
-- the shipped e-commerce figures (which filter by ship-to country), so they
-- aren't captured anywhere else. This table holds them for the Breakdown's
-- "Expo NZ" / "Expo AU" columns, kept separate from product_actuals so the
-- Summary grid, stock ledger and Budget vs Actual are untouched.
--
-- One row per product × market × month × event. Bundles are expanded to their
-- component units before loading (Shopify counts a bundle as 1 item).
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expo_sales (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  market       text NOT NULL CHECK (market IN ('NZ','AU')),
  year_month   date NOT NULL,                 -- first day of the month (e.g. 2026-10-01)
  units        numeric NOT NULL DEFAULT 0,
  event_label  text,                           -- e.g. 'Baby Show Oct', 'Brisbane Expo'
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, market, year_month, event_label)
);

CREATE INDEX IF NOT EXISTS expo_sales_month_idx ON public.expo_sales (year_month, market);

ALTER TABLE public.expo_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expo_sales_rw ON public.expo_sales;
CREATE POLICY expo_sales_rw ON public.expo_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
