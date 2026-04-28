-- ============================================================
-- Odi MRP — Data load: 5 Snack 4 B's products
-- Migration: 008_snack4bs_data.sql
--
-- Pure data load (not schema). Updates product fields + rebuilds
-- each product's active BOM lines. Idempotent: re-running clears
-- and re-inserts the BOM lines each time.
--
-- Products:
--   1. Odi Organic Banana              (ODI-ODI-ORGA-BANA-SNACK4-30G)
--   2. Odi Organic Cherry Choc         (ODI-ODI-ORGA-CHER-SNACK4-30G)
--   3. Odi Organic Cocoa & Collagen    (ODI-ODI-ORGA-COCO-SNACK4-20G)
--   4. Odi Organic Cashew & Collagen   (ODI-ODI-ORGA-CASH-SNACK4-20G)
--   5. Odi Organic Vanilla Choc Chip   (ODI-ODI-ORGA-VANI-SNACK4-20G)
--
-- All 5 use: apply_fx = true, wastage_pct = 0.10, other = -0.15
-- (except Vanilla Cookies where other = -0.07).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Create any new ingredients that don't already exist
-- ------------------------------------------------------------
INSERT INTO public.ingredients
  (sku_code, name, unit_of_measure, price, total_loaded_cost, is_organic, status, is_active)
SELECT
  'ING-' || UPPER(REGEXP_REPLACE(v.name, '[^A-Za-z0-9]+', '-', 'g')),
  v.name, 'kg', v.price, v.price, v.is_organic, 'confirmed', true
FROM (VALUES
  ('Rolled oats (GF certified)',     6.50::numeric, true),
  ('Oat flour',                       6.50::numeric, true),
  ('Organic bovine collagen',        15.00::numeric, true),
  ('Vanilla extract',                75.00::numeric, false),
  ('Dried banana + Powder',          35.00::numeric, true),
  ('Chia seeds meal',                12.00::numeric, true),
  ('Clean-label choc chips',         40.00::numeric, true),
  ('Cherries Dried',                 50.00::numeric, true),
  ('Medjool dates/paste',            15.00::numeric, true),
  ('Cashew meal/butter',             25.00::numeric, true),
  ('Desiccated coconut',              9.00::numeric, true),
  ('Organic berry powder',          150.00::numeric, true),
  ('Rolled in sprinkles',            30.00::numeric, false),
  ('Freeze-dried raspberry powder', 150.00::numeric, true),
  ('Vanilla powder or extract',      75.00::numeric, false),
  ('Tapioca flour',                   4.00::numeric, true),
  ('Baking soda',                     2.00::numeric, false),
  ('Chocolate chips',                40.00::numeric, true),
  ('Egg White Powder',               90.00::numeric, false),
  ('Coconut Sugar',                   8.00::numeric, true),
  ('Coconut Oil',                    12.00::numeric, false)
) AS v(name, price, is_organic)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ingredients i
  WHERE LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
)
ON CONFLICT (sku_code) DO NOTHING;

-- ------------------------------------------------------------
-- 2. ODI ORGANIC BANANA  (30g / serving 120g / RRP $12.99)
-- ------------------------------------------------------------
UPDATE public.products SET
  size_g        = 30,
  serving_size  = 120,
  hero_call_out = 'Wholefood Nutrition',
  back_of_pack  = 'TBC',
  rrp           = 12.99,
  packaging     = 0.65,
  toll          = 1.32,
  margin        = 0.49,
  other         = (-0.15)::numeric,
  freight       = 0.20,
  apply_fx      = true,
  wastage_pct   = 0.10
WHERE sku_code = 'ODI-ODI-ORGA-BANA-SNACK4-30G';

DELETE FROM public.bom_items WHERE bom_id IN (
  SELECT b.id FROM public.boms b
  JOIN public.products p ON p.id = b.product_id
  WHERE p.sku_code = 'ODI-ODI-ORGA-BANA-SNACK4-30G' AND b.is_active = true
);

INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Rolled oats (GF certified)', 11.20::numeric,  6.50::numeric, NULL::text,      1),
  ('Oat flour',                   3.50::numeric,  6.50::numeric, NULL::text,      2),
  ('Organic bovine collagen',     2.10::numeric, 15.00::numeric, NULL::text,      3),
  ('Maple syrup',                 5.95::numeric, 22.00::numeric, NULL::text,      4),
  ('Cocoa Butter',                1.75::numeric, 75.00::numeric, NULL::text,      5),
  ('Sea salt',                    0.03::numeric,  2.00::numeric, NULL::text,      6),
  ('Vanilla extract',             0.21::numeric, 75.00::numeric, 'Non Organic',   7),
  ('Dried banana + Powder',       2.10::numeric, 35.00::numeric, NULL::text,      8),
  ('almond meal',                 2.10::numeric, 31.00::numeric, NULL::text,      9),
  ('Chia seeds meal',             1.05::numeric, 12.00::numeric, NULL::text,     10)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-ORGA-BANA-SNACK4-30G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- ------------------------------------------------------------
-- 3. ODI ORGANIC CHERRY CHOC  (30g / serving 120g / RRP $9.99)
-- ------------------------------------------------------------
UPDATE public.products SET
  size_g = 30, serving_size = 120,
  hero_call_out = 'Wholefood Nutrition', back_of_pack = 'TBC',
  rrp = 9.99, packaging = 0.65, toll = 1.32, margin = 0.50,
  other = (-0.15)::numeric, freight = 0.20,
  apply_fx = true, wastage_pct = 0.10
WHERE sku_code = 'ODI-ODI-ORGA-CHER-SNACK4-30G';

DELETE FROM public.bom_items WHERE bom_id IN (
  SELECT b.id FROM public.boms b
  JOIN public.products p ON p.id = b.product_id
  WHERE p.sku_code = 'ODI-ODI-ORGA-CHER-SNACK4-30G' AND b.is_active = true
);

INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Rolled oats (GF certified)', 11.28::numeric,  6.50::numeric, NULL::text,      1),
  ('Oat flour',                   3.53::numeric,  6.50::numeric, NULL::text,      2),
  ('Organic bovine collagen',     2.12::numeric, 15.00::numeric, NULL::text,      3),
  ('Maple syrup',                 5.99::numeric, 22.00::numeric, NULL::text,      4),
  ('Cocoa Butter',                1.76::numeric, 75.00::numeric, NULL::text,      5),
  ('Sea salt',                    0.03::numeric,  2.00::numeric, 'Non Organic',   6),
  ('Vanilla extract',             0.21::numeric, 75.00::numeric, 'Non Organic',   7),
  ('Clean-label choc chips',      1.27::numeric, 40.00::numeric, NULL::text,      8),
  ('almond meal',                 2.40::numeric, 31.00::numeric, NULL::text,      9),
  ('Cherries Dried',              1.41::numeric, 50.00::numeric, NULL::text,     10)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-ORGA-CHER-SNACK4-30G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- ------------------------------------------------------------
-- 4. ODI ORGANIC COCOA & COLLAGEN BALLS  (20g / serving 120g / RRP $12.99)
-- ------------------------------------------------------------
UPDATE public.products SET
  size_g = 20, serving_size = 120,
  hero_call_out = 'Wholefood Nutrition', back_of_pack = 'TBC',
  rrp = 12.99, packaging = 0.52, toll = 1.98, margin = 0.63,
  other = (-0.15)::numeric, freight = 0.20,
  apply_fx = true, wastage_pct = 0.10
WHERE sku_code = 'ODI-ODI-ORGA-COCO-SNACK4-20G';

DELETE FROM public.bom_items WHERE bom_id IN (
  SELECT b.id FROM public.boms b
  JOIN public.products p ON p.id = b.product_id
  WHERE p.sku_code = 'ODI-ODI-ORGA-COCO-SNACK4-20G' AND b.is_active = true
);

INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Medjool dates/paste',     5.18::numeric,  15.00::numeric, NULL::text,    1),
  ('Almond meal',             2.49::numeric,  31.00::numeric, NULL::text,    2),
  ('Cashew meal/butter',      2.49::numeric,  25.00::numeric, NULL::text,    3),
  ('Desiccated coconut',      1.99::numeric,   9.00::numeric, NULL::text,    4),
  ('Cacao powder',            1.20::numeric,  30.00::numeric, NULL::text,    5),
  ('Organic berry powder',    1.00::numeric, 150.00::numeric, NULL::text,    6),
  ('Organic bovine collagen', 3.98::numeric,  15.00::numeric, NULL::text,    7),
  ('Sea salt',                0.08::numeric,   1.00::numeric, 'Non Organic', 8),
  ('Rolled in sprinkles',     1.59::numeric,  30.00::numeric, 'Non Organic', 9)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-ORGA-COCO-SNACK4-20G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- ------------------------------------------------------------
-- 5. ODI ORGANIC CASHEW & COLLAGEN BALLS  (20g / serving 100g / RRP $12.99)
-- ------------------------------------------------------------
UPDATE public.products SET
  size_g = 20, serving_size = 100,
  hero_call_out = 'Wholefood Nutrition', back_of_pack = 'TBC',
  rrp = 12.99, packaging = 0.52, toll = 1.98, margin = 0.61,
  other = (-0.15)::numeric, freight = 0.20,
  apply_fx = true, wastage_pct = 0.10
WHERE sku_code = 'ODI-ODI-ORGA-CASH-SNACK4-20G';

DELETE FROM public.bom_items WHERE bom_id IN (
  SELECT b.id FROM public.boms b
  JOIN public.products p ON p.id = b.product_id
  WHERE p.sku_code = 'ODI-ODI-ORGA-CASH-SNACK4-20G' AND b.is_active = true
);

INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Medjool dates/paste',           4.80::numeric,  15.00::numeric, NULL::text,    1),
  ('Cashew meal/butter',            4.80::numeric,  25.00::numeric, NULL::text,    2),
  ('Desiccated coconut',            2.00::numeric,   9.00::numeric, NULL::text,    3),
  ('Organic bovine collagen',       4.00::numeric,  15.00::numeric, NULL::text,    4),
  ('Sea salt',                      0.08::numeric,   2.00::numeric, 'Non Organic', 5),
  ('Rolled in sprinkles',           1.60::numeric,  30.00::numeric, 'Non Organic', 6),
  ('Freeze-dried raspberry powder', 1.30::numeric, 150.00::numeric, NULL::text,    7),
  ('Chia seeds meal',               1.20::numeric,  12.00::numeric, NULL::text,    8),
  ('Vanilla powder or extract',     0.20::numeric,  75.00::numeric, 'Non Organic', 9)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-ORGA-CASH-SNACK4-20G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- ------------------------------------------------------------
-- 6. ODI ORGANIC VANILLA CHOC CHIP CLEVER COOKIES  (20g / serving 100g / RRP $9.99)
-- ------------------------------------------------------------
UPDATE public.products SET
  size_g = 20, serving_size = 100,
  hero_call_out = 'Wholefood Nutrition', back_of_pack = 'TBC',
  rrp = 9.99, packaging = 0.52, toll = 1.98, margin = 0.60,
  other = (-0.07)::numeric, freight = 0.20,
  apply_fx = true, wastage_pct = 0.10
WHERE sku_code = 'ODI-ODI-ORGA-VANI-SNACK4-20G';

DELETE FROM public.bom_items WHERE bom_id IN (
  SELECT b.id FROM public.boms b
  JOIN public.products p ON p.id = b.product_id
  WHERE p.sku_code = 'ODI-ODI-ORGA-VANI-SNACK4-20G' AND b.is_active = true
);

INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Almond Meal',      8.93::numeric, 31.00::numeric, NULL::text,      1),
  ('Tapioca flour',    2.48::numeric,  4.00::numeric, NULL::text,      2),
  ('Maple syrup',      1.32::numeric, 22.00::numeric, NULL::text,      3),
  ('Baking soda',      0.04::numeric,  2.00::numeric, NULL::text,      4),
  ('Vanilla extract',  0.07::numeric, 75.00::numeric, 'Non Organic',   5),
  ('Chocolate chips',  2.15::numeric, 40.00::numeric, NULL::text,      6),
  ('Egg White Powder', 0.50::numeric, 90.00::numeric, NULL::text,      7),
  ('Coconut Sugar',    0.05::numeric,  8.00::numeric, NULL::text,      8),
  ('Sea salt',         0.05::numeric,  2.00::numeric, 'Non Organic',   9),
  ('Coconut Oil',      0.99::numeric, 12.00::numeric, 'Non Organic',  10),
  ('Oat Flour',        1.32::numeric,  7.00::numeric, NULL::text,     11)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-ORGA-VANI-SNACK4-20G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- ------------------------------------------------------------
-- Sanity check — shown in the Results panel on successful run
-- ------------------------------------------------------------
SELECT
  p.sku_code,
  p.name,
  p.size_g,
  p.serving_size,
  p.rrp,
  p.other,
  p.wastage_pct,
  p.apply_fx,
  (SELECT COUNT(*) FROM public.bom_items bi JOIN public.boms b ON b.id = bi.bom_id
   WHERE b.product_id = p.id AND b.is_active = true) AS bom_lines,
  (SELECT ROUND(SUM(bi.quantity_g), 2) FROM public.bom_items bi JOIN public.boms b ON b.id = bi.bom_id
   WHERE b.product_id = p.id AND b.is_active = true) AS total_g
FROM public.products p
WHERE p.sku_code IN (
  'ODI-ODI-ORGA-BANA-SNACK4-30G',
  'ODI-ODI-ORGA-CHER-SNACK4-30G',
  'ODI-ODI-ORGA-COCO-SNACK4-20G',
  'ODI-ODI-ORGA-CASH-SNACK4-20G',
  'ODI-ODI-ORGA-VANI-SNACK4-20G'
)
ORDER BY p.sku_code;

COMMIT;
