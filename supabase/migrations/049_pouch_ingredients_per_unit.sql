-- Convert Flavour Makers finished-pouch ingredients from per-kg to per-unit.
--
-- These ingredients are whole finished pouches (1 per product), but were set up
-- by weight (e.g. 120 g at $X/kg) so POs came out per-kg. This recasts them as
-- 'each' priced per unit, and sets their BOM line to 1 each — the per-unit cost
-- is unchanged (per-unit = per-kg × line grams ÷ 1000).
--
-- DATA migration (no schema change). Safe to run after the code deploy; the
-- per-unit costing only activates once an ingredient is 'each'. Idempotent.

-- 1) Scale the ingredient pricing to per-unit and switch the unit of measure.
WITH pouch AS (
  SELECT i.id, MAX(bi.quantity_g) AS line_g
  FROM public.ingredients i
  JOIN public.bom_items bi ON bi.ingredient_id = i.id
  WHERE i.sku_code LIKE 'ING-FLAVOUR-MAKERS-%-POUCH'
  GROUP BY i.id
)
UPDATE public.ingredients i SET
  unit_of_measure      = 'each',
  price                = ROUND(COALESCE(i.price, 0)             * (p.line_g / 1000.0), 4),
  total_loaded_cost    = ROUND(COALESCE(i.total_loaded_cost, 0) * (p.line_g / 1000.0), 4),
  total_loaded_cost_au = CASE WHEN i.total_loaded_cost_au IS NOT NULL
                              THEN ROUND(i.total_loaded_cost_au * (p.line_g / 1000.0), 4) END
FROM pouch p
WHERE p.id = i.id
  AND i.unit_of_measure <> 'each';   -- idempotent guard

-- 2) Set the BOM lines for those pouches to 1 each (scaling any per-line price
--    override the same way). RHS uses the old row values, so quantity_g is the
--    original grams when scaling the override.
UPDATE public.bom_items bi SET
  price_override = CASE WHEN bi.price_override IS NOT NULL
                       THEN ROUND(bi.price_override * (bi.quantity_g / 1000.0), 4) END,
  wet_quantity_g = NULL,
  quantity_g     = 1
WHERE bi.ingredient_id IN (
  SELECT id FROM public.ingredients WHERE sku_code LIKE 'ING-FLAVOUR-MAKERS-%-POUCH'
)
  AND bi.quantity_g <> 1;            -- idempotent guard
