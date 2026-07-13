-- ============================================================
-- Odi MRP — Budget vs Actual: product write-off tracker
-- Migration: 053_product_writeoffs.sql
--
-- Records units of finished product written off in a given month,
-- with a free-text reason. Surfaced on the BvA Products tab beside
-- Pipefill/Samples, rolled up on the Summary tab, and reduces the
-- calculated closing stock (Calc EOM). One row per product per month.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_writeoffs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  year_month   date NOT NULL,
  units        numeric(14, 4) NOT NULL DEFAULT 0,
  comment      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.user_profiles(id),
  UNIQUE (product_id, year_month)
);
CREATE INDEX IF NOT EXISTS idx_product_writeoffs_year_month ON public.product_writeoffs(year_month);
CREATE TRIGGER trg_product_writeoffs_updated_at BEFORE UPDATE ON public.product_writeoffs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_writeoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_writeoffs_select_authenticated" ON public.product_writeoffs;
CREATE POLICY "product_writeoffs_select_authenticated" ON public.product_writeoffs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "product_writeoffs_write_authenticated" ON public.product_writeoffs;
CREATE POLICY "product_writeoffs_write_authenticated" ON public.product_writeoffs FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
