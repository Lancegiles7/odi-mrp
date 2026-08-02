-- Per-unit ingredient costing: separate the unit COUNT from the gram WEIGHT.
--
-- Background: ingredients priced per unit (unit_of_measure in each/unit/case…)
-- were forced to store their unit count in bom_items.quantity_g (see 049 for the
-- pouches). That works when the item has no meaningful recipe weight, but breaks
-- for something like the ALB-GOLD noodle block: it's 62.5 g of the 80 g recipe
-- AND priced per unit ($0.36 each). One column can't be both "62.5 g" (weight)
-- and "1 unit" (cost) at once — entering 62.5 made it cost 62.5 × $0.36 = $22.50.
--
-- Fix: add bom_items.unit_quantity to hold the unit count for count-priced lines.
--   • quantity_g   → always real grams. Drives recipe weight, % of pack, nutrition.
--   • unit_quantity → number of units for count-priced ingredients. Drives cost
--     (unit_quantity × per-unit price) and procurement (order N units per product).
--     NULL for weight-priced (kg/g) ingredients — they keep costing on grams.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DEPLOY ORDER (matters — avoids a brief mis-cost of the pouch products):
--   1. Run STEPS 1 & 2 below in the Supabase SQL editor.
--   2. Deploy the code.
--   3. Run STEP 3 below.
-- Steps 1–2 are safe with the OLD code still live (it ignores the new column, and
-- the new code defaults a missing count to 1 unit). Step 3 rewrites pouch grams,
-- which only the NEW code costs correctly — so it runs last. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- STEP 1 — schema: the new column. Safe with old code (unused by it).
ALTER TABLE public.bom_items
  ADD COLUMN IF NOT EXISTS unit_quantity numeric;

COMMENT ON COLUMN public.bom_items.unit_quantity IS
  'For count-UoM ingredients (each/unit/case/box/bag/pallet): number of units per '
  'product unit. Drives cost (× per-unit price) and procurement. NULL for weight '
  'ingredients, which cost on quantity_g.';

-- STEP 2 — backfill the unit count. Every existing count-priced line represents
-- 1 unit per product (the pouches and the noodle block alike). Cost is unchanged
-- by this (new code already defaults a missing count to 1); it just makes it
-- explicit. Only touches rows without a count yet.
UPDATE public.bom_items bi
SET unit_quantity = 1
FROM public.ingredients i
WHERE bi.ingredient_id = i.id
  AND lower(trim(i.unit_of_measure)) IN ('each','unit','case','box','bag','pallet')
  AND bi.unit_quantity IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — RUN ONLY AFTER THE CODE IS DEPLOYED.
-- Restore real grams for the whole-product pouches. Migration 049 parked them at
-- quantity_g = 1 (a stand-in count). A pouch IS the entire product, so its weight
-- is the product size — set it back so recipe weight totals add up. The noodle
-- block (quantity_g = 62.5) is a partial ingredient, not a whole product, so it
-- is deliberately NOT matched here and keeps its 62.5 g.
-- (The old code would have costed these 120 g × per-unit price; the new code costs
--  them on unit_quantity, so this is only safe once the new code is live.)
-- Note: the UPDATE target (bi) can't be re-joined inside FROM in Postgres, so bi
-- is linked through the WHERE clause instead (comma-style joins).
UPDATE public.bom_items bi
SET quantity_g = p.size_g
FROM public.boms b, public.products p, public.ingredients i
WHERE bi.bom_id = b.id
  AND p.id = b.product_id
  AND i.id = bi.ingredient_id
  AND lower(trim(i.unit_of_measure)) IN ('each','unit','case','box','bag','pallet')
  AND bi.quantity_g = 1
  AND p.size_g > 0;
