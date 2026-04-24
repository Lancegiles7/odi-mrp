-- ============================================================
-- Odi MRP — Remediation for skipped parts of migration 005
-- Migration: 007_bom_items_remediation.sql
--
-- Migration 005 wasn't fully applied on all environments, leaving
-- bom_items with the original column names (quantity, unit_of_measure)
-- and missing the price_override / sort_order columns. This migration
-- detects what's missing and brings the table up to date safely.
--
-- Also ensures ingredients.is_organic exists (was added in 005) in
-- case the same environment skipped that too.
--
-- Safe to run even if 005 was fully applied — every change is guarded.
-- ============================================================

BEGIN;

-- ---- bom_items: rename quantity -> quantity_g ----
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bom_items' AND column_name = 'quantity'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bom_items' AND column_name = 'quantity_g'
  ) THEN
    ALTER TABLE public.bom_items RENAME COLUMN quantity TO quantity_g;
  END IF;
END $$;

-- ---- bom_items: rename unit_of_measure -> uom ----
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bom_items' AND column_name = 'unit_of_measure'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bom_items' AND column_name = 'uom'
  ) THEN
    ALTER TABLE public.bom_items RENAME COLUMN unit_of_measure TO uom;
  END IF;
END $$;

-- ---- bom_items: add price_override + sort_order if missing ----
ALTER TABLE public.bom_items
  ADD COLUMN IF NOT EXISTS price_override numeric(12, 4),
  ADD COLUMN IF NOT EXISTS sort_order     integer NOT NULL DEFAULT 0;

-- ---- Indexes for bom_items ----
DROP INDEX IF EXISTS public.idx_bom_items_bom_id;
CREATE INDEX IF NOT EXISTS idx_bom_items_bom_id        ON public.bom_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_items_ingredient_id ON public.bom_items(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_bom_items_sort_order    ON public.bom_items(bom_id, sort_order);

-- ---- ingredients: add is_organic if missing (from 005) ----
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS is_organic boolean NOT NULL DEFAULT true;

-- ---- products: ensure the unique index on sku_code has the current name ----
-- (Safe either way — harmless if the index already exists.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_code ON public.products(sku_code);

COMMIT;
