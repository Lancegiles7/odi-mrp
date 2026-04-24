-- ============================================================
-- Odi MRP — Data load: sachets, tubs, pouches + fix wastage
-- Migration: 009_more_products_data.sql
--
-- 14 products from the Odi Template PDF:
--   • 4 new sachets:   Broccoli, Blueberry, Beetroot, Carrot
--   • 1 updated sachet: Baby Cereal
--   • 4 updated tubs:   Smoothie Booster, Meal Booster, Beef Bone Broth, Baby Cereal
--   • 4 new pouches:   Chicken, Veggies, Vanilla, Berry  (single-bulk "flavour maker" ingredients)
--   • 1 updated snack: Sunflower Choc Chip Clever Cookies
--
-- Also corrects wastage on 3 previously-loaded Snacks (Cocoa Balls,
-- Cashew Balls, Vanilla Cookies) — sheet math shows these are 0%.
--
-- Wastage convention (matches PDF sheet math):
--   Sachets / Tubs  →  5%
--   Snacks 4B's     →  10% (Brownie/Banana/Cherry Choc) or 0% (the rest)
--   Pouches         →  0% (single bulk ingredient)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Create any new ingredients (case-insensitive dedupe)
-- ------------------------------------------------------------
INSERT INTO public.ingredients
  (sku_code, name, unit_of_measure, price, total_loaded_cost, is_organic, status, is_active)
SELECT
  'ING-' || UPPER(REGEXP_REPLACE(v.name, '[^A-Za-z0-9]+', '-', 'g')),
  v.name, 'kg', v.price, v.price, v.is_organic, 'confirmed', true
FROM (VALUES
  ('Chicken Bone broth organic',       207.27::numeric, true),
  ('Broccoli Powder AD organic',        68.10::numeric, true),
  ('Carrot Powder FD organic',          83.00::numeric, true),
  ('Kelp powder',                       55.19::numeric, true),
  ('Pumpkin powder AD organic',         98.00::numeric, true),
  ('Dried Quinoa Powder',               12.93::numeric, true),
  ('Spirulina Powder',                  65.10::numeric, true),
  ('Beef Liver organic',                91.44::numeric, true),
  ('Beef Spleen organic',               96.94::numeric, true),
  ('Apple Powder organic',              65.00::numeric, true),
  ('Blueberry powder organic',         134.00::numeric, true),
  ('Cauliflower Powder organic',        99.00::numeric, true),
  ('Chia Instant Powder',               13.34::numeric, true),
  ('Beef Bone broth organic',           74.66::numeric, true),
  ('Cinnamon',                          24.95::numeric, true),
  ('Beetroot powder organic',           60.10::numeric, true),
  ('Blackcurrant powder organic',       88.00::numeric, true),
  ('Strawberry Powder organic',         75.26::numeric, true),
  ('Camu Camu Powder',                  86.33::numeric, true),
  ('Collagen Powder',                  119.44::numeric, true),
  ('Green Pea Leaf powder organic',     65.10::numeric, true),
  ('Herbamare',                         29.61::numeric, false),
  ('Spinach Powder AD organic',         55.10::numeric, true),
  ('Ground Organic Oats',                4.16::numeric, true),
  ('Sunflower seed meal',               14.00::numeric, true),
  ('Egg Powder',                        90.00::numeric, false),
  ('Flavour Makers Chicken Pouch',      11.33::numeric, true),
  ('Flavour Makers Veggie Pouch',       10.08::numeric, true),
  ('Flavour Makers Vanilla Pouch',       9.83::numeric, true),
  ('Flavour Makers Berry Pouch',        11.25::numeric, true)
) AS v(name, price, is_organic)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ingredients i
  WHERE LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
)
ON CONFLICT (sku_code) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Insert new products (sachets + pouches). UPSERT on sku_code.
-- ------------------------------------------------------------
INSERT INTO public.products
  (sku_code, name, product_type, size_g, serving_size, hero_call_out, back_of_pack,
   rrp, packaging, toll, margin, other, freight, apply_fx, wastage_pct, is_active, unit_of_measure)
VALUES
  -- Sachets (Size = Serving = 20g, no FX, 5% wastage, P $0.13 / T $0.40)
  ('ODI-BABY-PURE-BROC-SACHET-20G', 'Odi Baby Puree Powder Organic Broccoli',
   'sachets', 20, 20, 'Iodine for Growth', 'Iodine',
   4.50, 0.13, 0.40, 0, 0, 0, false, 0.05, true, 'each'),
  ('ODI-BABY-PURE-BLUE-SACHET-20G', 'Odi Baby Puree Powder Organic Blueberry',
   'sachets', 20, 20, 'Iron for Brain', 'Iron',
   4.50, 0.13, 0.40, 0, 0, 0, false, 0.05, true, 'each'),
  ('ODI-BABY-PURE-BEET-SACHET-20G', 'Odi Baby Puree Powder Organic Beetroot',
   'sachets', 20, 20, 'Iodine for Growth', 'Iodine',
   4.50, 0.13, 0.40, 0, 0, 0, false, 0.05, true, 'each'),
  ('ODI-BABY-PURE-CARR-SACHET-20G', 'Odi Baby Puree Powder Organic Carrot',
   'sachets', 20, 20, 'Iron for Brain', 'Iron',
   4.50, 0.13, 0.40, 0, 0, 0, false, 0.05, true, 'each'),
  -- Pouches (Size = Serving = 120g, FX on, 0% wastage, P $0.16 / F $0.20)
  ('ODI-BABY-PURE-CHIC-POUCH-120G', 'Odi Baby Puree Organic Chicken',
   'pouches', 120, 120, 'Wholefood Nutrition', 'TBC',
   4.49, 0.16, 0, 0, 0, 0.20, true, 0, true, 'each'),
  ('ODI-BABY-PURE-VEGG-POUCH-120G', 'Odi Baby Puree Organic Veggies',
   'pouches', 120, 120, 'Wholefood Nutrition', 'TBC',
   4.49, 0.16, 0, 0, 0, 0.20, true, 0, true, 'each'),
  ('ODI-BABY-PURE-VANI-POUCH-120G', 'Odi Baby Puree Organic Vanilla',
   'pouches', 120, 120, 'Wholefood Nutrition', 'TBC',
   4.49, 0.16, 0, 0, 0, 0.20, true, 0, true, 'each'),
  ('ODI-BABY-PURE-BERR-POUCH-120G', 'Odi Baby Puree Organic Berry',
   'pouches', 120, 120, 'Wholefood Nutrition', 'TBC',
   4.49, 0.16, 0, 0, 0, 0.20, true, 0, true, 'each')
ON CONFLICT (sku_code) DO UPDATE SET
  name          = EXCLUDED.name,
  product_type  = EXCLUDED.product_type,
  size_g        = EXCLUDED.size_g,
  serving_size  = EXCLUDED.serving_size,
  hero_call_out = EXCLUDED.hero_call_out,
  back_of_pack  = EXCLUDED.back_of_pack,
  rrp           = EXCLUDED.rrp,
  packaging     = EXCLUDED.packaging,
  toll          = EXCLUDED.toll,
  margin        = EXCLUDED.margin,
  other         = EXCLUDED.other,
  freight       = EXCLUDED.freight,
  apply_fx      = EXCLUDED.apply_fx,
  wastage_pct   = EXCLUDED.wastage_pct,
  is_active     = true;

-- Ensure an active BOM v1 exists for every new product
INSERT INTO public.boms (product_id, version, is_active)
SELECT p.id, 1, true
FROM public.products p
WHERE p.sku_code IN (
  'ODI-BABY-PURE-BROC-SACHET-20G',
  'ODI-BABY-PURE-BLUE-SACHET-20G',
  'ODI-BABY-PURE-BEET-SACHET-20G',
  'ODI-BABY-PURE-CARR-SACHET-20G',
  'ODI-BABY-PURE-CHIC-POUCH-120G',
  'ODI-BABY-PURE-VEGG-POUCH-120G',
  'ODI-BABY-PURE-VANI-POUCH-120G',
  'ODI-BABY-PURE-BERR-POUCH-120G'
)
AND NOT EXISTS (
  SELECT 1 FROM public.boms b
  WHERE b.product_id = p.id AND b.is_active = true
);

-- ------------------------------------------------------------
-- 3. Update existing products (tubs, cereal sachet, cookies)
-- ------------------------------------------------------------

-- Baby Cereal Sachet
UPDATE public.products SET
  size_g = 20, serving_size = 20,
  hero_call_out = 'Iron for Brain', back_of_pack = 'Iron, Vit C',
  rrp = 4.50, packaging = 0.13, toll = 0.40, margin = 0, other = 0, freight = 0,
  apply_fx = false, wastage_pct = 0.05
WHERE sku_code = 'ODI-ODI-BABY-PURE-SACHET-20G';

-- Smoothie Booster Tub
UPDATE public.products SET
  size_g = 125, serving_size = 5,
  hero_call_out = 'Iron for Brain', back_of_pack = 'Iron, Vit C',
  rrp = 34.99, packaging = 0.91, toll = 2.50, margin = 0, other = 0, freight = 0,
  apply_fx = false, wastage_pct = 0.05
WHERE sku_code = 'ODI-ODI-ORGA-SMOO-TUB-125G';

-- Meal Booster Tub
UPDATE public.products SET
  size_g = 125, serving_size = 5,
  hero_call_out = 'Wholefood Nutrition', back_of_pack = 'Iron',
  rrp = 34.99, packaging = 0.91, toll = 2.50, margin = 0, other = 0, freight = 0,
  apply_fx = false, wastage_pct = 0.05
WHERE sku_code = 'ODI-ODI-ORGA-MEAL-TUB-125G';

-- Beef Bone Broth Tub
UPDATE public.products SET
  size_g = 125, serving_size = 5,
  hero_call_out = 'Protein for Growth', back_of_pack = 'TBC',
  rrp = 34.99, packaging = 0.91, toll = 2.50, margin = 0, other = 0, freight = 0,
  apply_fx = false, wastage_pct = 0.05
WHERE sku_code = 'ODI-ODI-ORGA-BEEF-TUB-125G';

-- Baby Cereal Tub
UPDATE public.products SET
  size_g = 150, serving_size = 20,
  hero_call_out = 'Iron for Brain', back_of_pack = 'Iron, Vit C',
  rrp = 34.99, packaging = 0.91, toll = 2.50, margin = 0, other = 0, freight = 0,
  apply_fx = false, wastage_pct = 0.05
WHERE sku_code = 'ODI-ODI-ORGA-BABY-TUB-150G';

-- Sunflower Choc Chip Cookies
UPDATE public.products SET
  size_g = 20, serving_size = 120,
  hero_call_out = 'Wholefood Nutrition', back_of_pack = 'TBC',
  rrp = 9.99, packaging = 0.52, toll = 1.98, margin = 0.59,
  other = (-0.07)::numeric, freight = 0.20,
  apply_fx = true, wastage_pct = 0
WHERE sku_code = 'ODI-ODI-ORGA-SUNF-SNACK4-20G';

-- ------------------------------------------------------------
-- 4. Correct wastage on previously-loaded Snacks 4B's
-- (sheet math shows 0% for these three, not 10%)
-- ------------------------------------------------------------
UPDATE public.products
SET wastage_pct = 0
WHERE sku_code IN (
  'ODI-ODI-ORGA-COCO-SNACK4-20G',
  'ODI-ODI-ORGA-CASH-SNACK4-20G',
  'ODI-ODI-ORGA-VANI-SNACK4-20G'
);

-- ------------------------------------------------------------
-- 5. Clear existing BOM lines on every product in this migration
-- ------------------------------------------------------------
DELETE FROM public.bom_items
WHERE bom_id IN (
  SELECT b.id
  FROM public.boms b
  JOIN public.products p ON p.id = b.product_id
  WHERE b.is_active = true AND p.sku_code IN (
    'ODI-BABY-PURE-BROC-SACHET-20G',
    'ODI-BABY-PURE-BLUE-SACHET-20G',
    'ODI-BABY-PURE-BEET-SACHET-20G',
    'ODI-BABY-PURE-CARR-SACHET-20G',
    'ODI-ODI-BABY-PURE-SACHET-20G',
    'ODI-ODI-ORGA-SMOO-TUB-125G',
    'ODI-ODI-ORGA-MEAL-TUB-125G',
    'ODI-ODI-ORGA-BEEF-TUB-125G',
    'ODI-ODI-ORGA-BABY-TUB-150G',
    'ODI-BABY-PURE-CHIC-POUCH-120G',
    'ODI-BABY-PURE-VEGG-POUCH-120G',
    'ODI-BABY-PURE-VANI-POUCH-120G',
    'ODI-BABY-PURE-BERR-POUCH-120G',
    'ODI-ODI-ORGA-SUNF-SNACK4-20G'
  )
);

-- ------------------------------------------------------------
-- 6. BOM lines — insert via inline VALUES, keyed by SKU + ingredient name
-- ------------------------------------------------------------

-- 6a. Broccoli Sachet
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Chicken Bone broth organic',  3.0000::numeric, 207.27::numeric, NULL::text, 1),
  ('Broccoli Powder AD organic',  1.0000::numeric,  68.10::numeric, NULL::text, 2),
  ('Carrot Powder FD organic',    3.6000::numeric,  83.00::numeric, NULL::text, 3),
  ('Kelp powder',                 0.0035::numeric,  55.19::numeric, NULL::text, 4),
  ('Pumpkin powder AD organic',   3.1000::numeric,  98.00::numeric, NULL::text, 5),
  ('Dried Quinoa Powder',         9.0900::numeric,  12.93::numeric, NULL::text, 6),
  ('Spirulina Powder',            0.2100::numeric,  65.10::numeric, NULL::text, 7)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-BABY-PURE-BROC-SACHET-20G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- 6b. Blueberry Sachet
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Beef Liver organic',         0.0500::numeric,  91.44::numeric, NULL::text, 1),
  ('Beef Spleen organic',        0.4700::numeric,  96.94::numeric, NULL::text, 2),
  ('Apple Powder organic',       3.0000::numeric,  65.00::numeric, NULL::text, 3),
  ('Blueberry powder organic',   1.1000::numeric, 134.00::numeric, NULL::text, 4),
  ('Cauliflower Powder organic', 3.0000::numeric,  99.00::numeric, NULL::text, 5),
  ('Chia Instant Powder',        3.0300::numeric,  13.34::numeric, NULL::text, 6),
  ('Dried Quinoa Powder',        9.3500::numeric,  12.93::numeric, NULL::text, 7)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-BABY-PURE-BLUE-SACHET-20G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- 6c. Beetroot Sachet
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Chicken Bone broth organic',  2.9700::numeric, 207.27::numeric, NULL::text, 1),
  ('Cauliflower Powder organic',  4.6300::numeric,  99.00::numeric, NULL::text, 2),
  ('Beetroot powder organic',     2.2000::numeric,  60.10::numeric, NULL::text, 3),
  ('Kelp powder',                 0.0035::numeric,  55.19::numeric, NULL::text, 4),
  ('Dried Quinoa Powder',        10.2000::numeric,  12.93::numeric, NULL::text, 5)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-BABY-PURE-BEET-SACHET-20G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- 6d. Carrot Sachet
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Beef Liver organic',         0.0500::numeric,  91.44::numeric, NULL::text, 1),
  ('Beef Spleen organic',        0.4700::numeric,  96.94::numeric, NULL::text, 2),
  ('Beef Bone broth organic',    3.5800::numeric,  74.66::numeric, NULL::text, 3),
  ('Carrot Powder FD organic',   4.3500::numeric,  83.00::numeric, NULL::text, 4),
  ('Cinnamon',                   0.2000::numeric,  24.95::numeric, NULL::text, 5),
  ('Pumpkin powder AD organic',  2.0000::numeric,  98.00::numeric, NULL::text, 6),
  ('Dried Quinoa Powder',        9.3500::numeric,  12.93::numeric, NULL::text, 7)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-BABY-PURE-CARR-SACHET-20G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- 6e. Baby Cereal Sachet (update)
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Beef Liver organic',     0.0400::numeric,  91.44::numeric, NULL::text, 1),
  ('Beef Spleen organic',    0.4100::numeric,  96.94::numeric, NULL::text, 2),
  ('Apple Powder organic',   4.3900::numeric,  65.00::numeric, NULL::text, 3),
  ('Camu Camu Powder',       0.3100::numeric,  86.33::numeric, NULL::text, 4),
  ('Chia Instant Powder',    4.0000::numeric,  13.34::numeric, NULL::text, 5),
  ('Ground Organic Oats',    4.1800::numeric,   4.16::numeric, NULL::text, 6),
  ('Dried Quinoa Powder',    6.6700::numeric,  12.93::numeric, NULL::text, 7)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-BABY-PURE-SACHET-20G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- 6f. Smoothie Booster Tub
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Beef Liver organic',          1.2500::numeric,  91.44::numeric, NULL::text,  1),
  ('Beef Spleen organic',        11.7500::numeric,  96.94::numeric, NULL::text,  2),
  ('Apple Powder organic',       20.0000::numeric,  65.00::numeric, NULL::text,  3),
  ('Beetroot powder organic',     4.0000::numeric,  60.10::numeric, NULL::text,  4),
  ('Blackcurrant powder organic', 9.5000::numeric,  88.00::numeric, NULL::text,  5),
  ('Blueberry powder organic',    4.0000::numeric, 134.00::numeric, NULL::text,  6),
  ('Strawberry Powder organic',   4.0000::numeric,  75.26::numeric, NULL::text,  7),
  ('Camu Camu Powder',            8.0000::numeric,  86.33::numeric, NULL::text,  8),
  ('Collagen Powder',            34.5000::numeric, 119.44::numeric, NULL::text,  9),
  ('Dried Quinoa Powder',        28.0000::numeric,  12.93::numeric, NULL::text, 10)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-ORGA-SMOO-TUB-125G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- 6g. Meal Booster Tub
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Beef Liver organic',              1.2500::numeric,  91.44::numeric, NULL::text, 1),
  ('Beef Spleen organic',            11.7500::numeric,  96.94::numeric, NULL::text, 2),
  ('Chicken Bone broth organic',     38.0000::numeric, 207.27::numeric, NULL::text, 3),
  ('Broccoli Powder AD organic',      6.0000::numeric,  68.10::numeric, NULL::text, 4),
  ('Green Pea Leaf powder organic',   6.0000::numeric,  65.10::numeric, NULL::text, 5),
  ('Carrot Powder FD organic',       16.0000::numeric,  83.00::numeric, NULL::text, 6),
  ('Herbamare',                      15.0000::numeric,  29.61::numeric, NULL::text, 7),
  ('Dried Quinoa Powder',            25.0000::numeric,  12.93::numeric, NULL::text, 8),
  ('Spinach Powder AD organic',       6.0000::numeric,  55.10::numeric, NULL::text, 9)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-ORGA-MEAL-TUB-125G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- 6h. Beef Bone Broth Tub
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Beef Bone broth organic', 125.0000::numeric, 74.66::numeric, NULL::text, 1)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-ORGA-BEEF-TUB-125G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- 6i. Baby Cereal Tub
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Beef Liver organic',    0.3200::numeric,  91.44::numeric, NULL::text, 1),
  ('Beef Spleen organic',   3.0700::numeric,  96.94::numeric, NULL::text, 2),
  ('Apple Powder organic', 32.9600::numeric,  65.00::numeric, NULL::text, 3),
  ('Camu Camu Powder',      2.3000::numeric,  86.33::numeric, NULL::text, 4),
  ('Chia Instant Powder',  30.0000::numeric,  13.34::numeric, NULL::text, 5),
  ('Ground Organic Oats',  31.3500::numeric,   4.16::numeric, NULL::text, 6),
  ('Dried Quinoa Powder',  50.0000::numeric,  12.93::numeric, NULL::text, 7)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-ORGA-BABY-TUB-150G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- 6j-m. Pouches — each has a single 120g "flavour maker" ingredient
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, 120.00::numeric, 'g', 11.33::numeric, NULL::text, 1
FROM public.ingredients i
JOIN public.products    p ON p.sku_code = 'ODI-BABY-PURE-CHIC-POUCH-120G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true
WHERE i.name = 'Flavour Makers Chicken Pouch';

INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, 120.00::numeric, 'g', 10.08::numeric, NULL::text, 1
FROM public.ingredients i
JOIN public.products    p ON p.sku_code = 'ODI-BABY-PURE-VEGG-POUCH-120G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true
WHERE i.name = 'Flavour Makers Veggie Pouch';

INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, 120.00::numeric, 'g', 9.83::numeric, NULL::text, 1
FROM public.ingredients i
JOIN public.products    p ON p.sku_code = 'ODI-BABY-PURE-VANI-POUCH-120G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true
WHERE i.name = 'Flavour Makers Vanilla Pouch';

INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, 120.00::numeric, 'g', 11.25::numeric, NULL::text, 1
FROM public.ingredients i
JOIN public.products    p ON p.sku_code = 'ODI-BABY-PURE-BERR-POUCH-120G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true
WHERE i.name = 'Flavour Makers Berry Pouch';

-- 6n. Sunflower Choc Chip Clever Cookies (update)
INSERT INTO public.bom_items (bom_id, ingredient_id, quantity_g, uom, price_override, notes, sort_order)
SELECT b.id, i.id, v.qty_g, 'g', v.price, v.notes, v.sort_order
FROM (VALUES
  ('Maple syrup',          1.11::numeric, 22.00::numeric, NULL::text,         1),
  ('Coconut Oil',          2.23::numeric, 11.00::numeric, 'Non Organic',      2),
  ('Baking soda',          0.07::numeric,  3.00::numeric, NULL::text,         3),
  ('Vanilla extract',      0.06::numeric, 75.00::numeric, 'Non Organic',      4),
  ('Chocolate chips',      2.23::numeric, 40.00::numeric, NULL::text,         5),
  ('Sunflower seed meal',  6.40::numeric, 14.00::numeric, NULL::text,         6),
  ('Egg Powder',           0.84::numeric, 90.00::numeric, NULL::text,         7),
  ('Sea salt',             0.84::numeric,  2.00::numeric, 'Non Organic',      8),
  ('Buckwheat Flour',      2.23::numeric, 10.00::numeric, NULL::text,         9),
  ('Tapioca flour',        0.11::numeric,  7.00::numeric, 'Non Organic',     10),
  ('Coconut Sugar',        2.23::numeric,  8.00::numeric, NULL::text,        11)
) AS v(name, qty_g, price, notes, sort_order)
JOIN public.ingredients i ON LOWER(TRIM(i.name)) = LOWER(TRIM(v.name))
JOIN public.products    p ON p.sku_code = 'ODI-ODI-ORGA-SUNF-SNACK4-20G'
JOIN public.boms        b ON b.product_id = p.id AND b.is_active = true;

-- ------------------------------------------------------------
-- 7. Sanity check — expected counts + totals
-- ------------------------------------------------------------
SELECT
  p.sku_code,
  p.name,
  p.product_type,
  p.size_g,
  p.serving_size,
  p.rrp,
  p.wastage_pct,
  p.apply_fx,
  (SELECT COUNT(*)              FROM public.bom_items bi JOIN public.boms b ON b.id = bi.bom_id
   WHERE b.product_id = p.id AND b.is_active = true) AS bom_lines,
  (SELECT ROUND(SUM(bi.quantity_g), 2) FROM public.bom_items bi JOIN public.boms b ON b.id = bi.bom_id
   WHERE b.product_id = p.id AND b.is_active = true) AS total_g
FROM public.products p
WHERE p.sku_code IN (
  'ODI-BABY-PURE-BROC-SACHET-20G',
  'ODI-BABY-PURE-BLUE-SACHET-20G',
  'ODI-BABY-PURE-BEET-SACHET-20G',
  'ODI-BABY-PURE-CARR-SACHET-20G',
  'ODI-ODI-BABY-PURE-SACHET-20G',
  'ODI-ODI-ORGA-SMOO-TUB-125G',
  'ODI-ODI-ORGA-MEAL-TUB-125G',
  'ODI-ODI-ORGA-BEEF-TUB-125G',
  'ODI-ODI-ORGA-BABY-TUB-150G',
  'ODI-BABY-PURE-CHIC-POUCH-120G',
  'ODI-BABY-PURE-VEGG-POUCH-120G',
  'ODI-BABY-PURE-VANI-POUCH-120G',
  'ODI-BABY-PURE-BERR-POUCH-120G',
  'ODI-ODI-ORGA-SUNF-SNACK4-20G'
)
ORDER BY p.product_type, p.sku_code;

COMMIT;
