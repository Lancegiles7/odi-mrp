-- ============================================================
-- Odi MRP — Ingredients schema extension
-- Migration: 004_ingredients_extended.sql
--
-- Renames `code` → `sku_code` and adds procurement columns.
-- Safe to run against a fresh DB (Phase 1 migrations already applied).
-- ============================================================

-- Rename code → sku_code (the UNIQUE constraint index follows automatically)
ALTER TABLE public.ingredients RENAME COLUMN code TO sku_code;

-- Procurement / import columns
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS confirmed_supplier text,
  ADD COLUMN IF NOT EXISTS lead_time          text,
  ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS price              numeric(12, 4),
  ADD COLUMN IF NOT EXISTS freight            numeric(12, 4),
  ADD COLUMN IF NOT EXISTS total_loaded_cost  numeric(12, 4);

-- Constrain status to known values
ALTER TABLE public.ingredients
  ADD CONSTRAINT chk_ingredient_status
    CHECK (status IN ('confirmed', 'pending', 'inactive'));

-- Update the existing index name so it reflects the column rename
-- (The UNIQUE index itself is unaffected, just the naming for clarity)
DROP INDEX IF EXISTS public.idx_ingredients_code;
CREATE INDEX IF NOT EXISTS idx_ingredients_sku_code ON public.ingredients(sku_code);

COMMENT ON COLUMN public.ingredients.sku_code            IS 'Unique ingredient SKU code (e.g. ING-ORG-CHIA-POW).';
COMMENT ON COLUMN public.ingredients.confirmed_supplier  IS 'Primary confirmed supplier name (denormalised; FK to suppliers added later).';
COMMENT ON COLUMN public.ingredients.lead_time           IS 'Supplier lead time as free text (e.g. ''2 weeks'').';
COMMENT ON COLUMN public.ingredients.status              IS 'confirmed | pending | inactive — procurement status of the ingredient.';
COMMENT ON COLUMN public.ingredients.price               IS 'Unit price from supplier (excluding freight).';
COMMENT ON COLUMN public.ingredients.freight             IS 'Freight cost per unit.';
COMMENT ON COLUMN public.ingredients.total_loaded_cost   IS 'Total landed cost per unit (price + freight). Stored, not computed, to allow manual override.';
