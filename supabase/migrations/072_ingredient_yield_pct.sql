-- ============================================================
-- Ingredient production yield allowance.
--
-- yield_pct lifts an ingredient's per-unit demand/consumption to cover loss in
-- manufacture (e.g. 5% on noodles). Stored as a fraction: 0.05 = 5%. Applied in
-- aggregateIngredientDemand, so it flows to Ingredient demand + Stock Movements.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS yield_pct numeric(6,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ingredients.yield_pct IS 'Production yield allowance (fraction, e.g. 0.05 = 5%) — lifts this ingredient''s per-unit demand to cover manufacturing loss.';

-- Seed the requested 5% yield on the ALB-GOLD noodle.
UPDATE public.ingredients SET yield_pct = 0.05 WHERE sku_code = 'ING-NOD-BIOMIE';
