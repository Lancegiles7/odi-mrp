-- ============================================================
-- Odi MRP — Fix stock-movement balance trigger
-- Migration: 052_fix_stock_movement_conflict.sql
--
-- Bug: receiving stock failed with
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Migration 017 replaced the full UNIQUE (ingredient_id, location_id) index on
-- inventory_balances with two PARTIAL unique indexes:
--   idx_inventory_balances_ing_loc ... WHERE ingredient_id IS NOT NULL
--   idx_inventory_balances_pak_loc ... WHERE packaging_id  IS NOT NULL
--
-- Postgres can only infer a partial unique index for ON CONFLICT if the
-- statement repeats the index predicate. The trigger's ON CONFLICT clauses
-- omitted the predicate, so no index matched and every stock movement failed.
--
-- Fix: add the matching WHERE predicate to each ON CONFLICT clause.
-- Pure trigger-function change; no data is touched.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ingredient_id IS NOT NULL THEN
    INSERT INTO public.inventory_balances (ingredient_id, location_id, quantity_on_hand, last_movement_at, updated_at)
    VALUES (NEW.ingredient_id, NEW.location_id, NEW.quantity, now(), now())
    ON CONFLICT (ingredient_id, location_id) WHERE ingredient_id IS NOT NULL DO UPDATE
      SET quantity_on_hand = public.inventory_balances.quantity_on_hand + NEW.quantity,
          last_movement_at = now(),
          updated_at       = now();
  ELSIF NEW.packaging_id IS NOT NULL THEN
    INSERT INTO public.inventory_balances (packaging_id, location_id, quantity_on_hand, last_movement_at, updated_at)
    VALUES (NEW.packaging_id, NEW.location_id, NEW.quantity, now(), now())
    ON CONFLICT (packaging_id, location_id) WHERE packaging_id IS NOT NULL DO UPDATE
      SET quantity_on_hand = public.inventory_balances.quantity_on_hand + NEW.quantity,
          last_movement_at = now(),
          updated_at       = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
