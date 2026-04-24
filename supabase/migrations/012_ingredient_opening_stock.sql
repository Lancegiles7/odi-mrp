-- ============================================================
-- Odi MRP — Ingredient demand: manual opening-stock override
-- Migration: 012_ingredient_opening_stock.sql
--
-- Adds a manual opening-stock override on ingredients, mirroring the
-- products.opening_stock_override pattern. Used by the Ingredient demand
-- report as the baseline before the full inventory system is wired.
-- ============================================================

BEGIN;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS opening_stock_override numeric(14, 4);

COMMENT ON COLUMN public.ingredients.opening_stock_override
  IS 'Manual opening-stock override (in the ingredient''s unit_of_measure). Takes precedence over inventory_balances when set. Nullable — clear to fall back to on-hand inventory.';

COMMIT;
