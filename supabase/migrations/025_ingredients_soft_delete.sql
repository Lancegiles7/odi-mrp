-- ============================================================
-- 025 — Ingredients soft delete
--
-- Adds the same deleted_at / deleted_by pair the products table
-- already uses, so ingredients can be soft-deleted (hidden from
-- the active list + BOM picker, recoverable from /ingredients/trash
-- for 30 days). The row is retained so existing recipes, PO history
-- and inventory references continue to resolve.
-- ============================================================

BEGIN;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.user_profiles(id);

-- Active lookups (list, BOM picker, demand pages) filter on
-- deleted_at IS NULL — a partial index keeps those fast.
CREATE INDEX IF NOT EXISTS idx_ingredients_active_not_deleted
  ON public.ingredients(id) WHERE deleted_at IS NULL;

-- The trash page orders by deleted_at desc — index that too.
CREATE INDEX IF NOT EXISTS idx_ingredients_deleted_at
  ON public.ingredients(deleted_at DESC) WHERE deleted_at IS NOT NULL;

COMMIT;
