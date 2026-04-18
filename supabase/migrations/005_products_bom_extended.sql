-- ============================================================
-- Odi MRP — Products + BOM extended schema
-- Migration: 005_products_bom_extended.sql
-- ============================================================

-- ============================================================
-- INGREDIENTS: add is_organic flag
-- Default true — all existing ingredients are assumed organic.
-- Non-organic ingredients must be explicitly flagged.
-- ============================================================
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS is_organic boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ingredients.is_organic IS 'True = organic (default). False = non-organic ingredient.';


-- ============================================================
-- PRODUCTS: rename sku → sku_code, add product master fields
-- ============================================================
ALTER TABLE public.products RENAME COLUMN sku TO sku_code;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type      text,
  ADD COLUMN IF NOT EXISTS size_g            numeric(12, 4),
  ADD COLUMN IF NOT EXISTS hero_call_out     text,
  ADD COLUMN IF NOT EXISTS back_of_pack      text,
  ADD COLUMN IF NOT EXISTS serving_size      numeric(12, 4),
  ADD COLUMN IF NOT EXISTS rrp               numeric(12, 4),
  -- Cost input fields — stored, not calculated
  ADD COLUMN IF NOT EXISTS packaging         numeric(12, 4),
  ADD COLUMN IF NOT EXISTS toll              numeric(12, 4),
  ADD COLUMN IF NOT EXISTS margin            numeric(12, 4),
  ADD COLUMN IF NOT EXISTS other             numeric(12, 4),   -- "Non-Organic Task" in spreadsheet
  ADD COLUMN IF NOT EXISTS currency_exchange numeric(12, 4),   -- flat NZD amount (not rate)
  ADD COLUMN IF NOT EXISTS freight           numeric(12, 4);

COMMENT ON COLUMN public.products.product_type      IS 'Product category / type (e.g. Sachet, Tub, Pouch).';
COMMENT ON COLUMN public.products.size_g            IS 'Pack size in grams.';
COMMENT ON COLUMN public.products.serving_size      IS 'Serving size in grams.';
COMMENT ON COLUMN public.products.rrp               IS 'Recommended retail price (NZD).';
COMMENT ON COLUMN public.products.packaging         IS 'Packaging cost per unit (NZD). Stored input.';
COMMENT ON COLUMN public.products.toll              IS 'Toll manufacturing cost per unit (NZD). Stored input.';
COMMENT ON COLUMN public.products.margin            IS 'Margin contribution per unit (NZD). Stored input.';
COMMENT ON COLUMN public.products.other             IS 'Other / Non-Organic Task cost per unit (NZD). Stored input.';
COMMENT ON COLUMN public.products.currency_exchange IS 'Currency exchange cost contribution per unit (NZD). Stored input.';
COMMENT ON COLUMN public.products.freight           IS 'Freight cost per unit (NZD). Stored input.';


-- ============================================================
-- BOM ITEMS: rename quantity → quantity_g, add price_override
-- quantity_g is the primary stored input (grams per unit of product)
-- ============================================================
ALTER TABLE public.bom_items RENAME COLUMN quantity TO quantity_g;
ALTER TABLE public.bom_items RENAME COLUMN unit_of_measure TO uom;  -- internal alias; keep short

ALTER TABLE public.bom_items
  ADD COLUMN IF NOT EXISTS price_override numeric(12, 4),
  ADD COLUMN IF NOT EXISTS sort_order     integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bom_items.quantity_g     IS 'Amount of ingredient per unit of product, in grams. Primary stored input.';
COMMENT ON COLUMN public.bom_items.price_override IS 'Override price per kg for this line only. NULL = use ingredient.total_loaded_cost.';
COMMENT ON COLUMN public.bom_items.sort_order     IS 'Display order of ingredient lines within BOM.';
COMMENT ON COLUMN public.bom_items.notes          IS 'e.g. Non Organic, or other line-level notes.';

-- Update index for renamed column
DROP INDEX IF EXISTS public.idx_bom_items_bom_id;
CREATE INDEX IF NOT EXISTS idx_bom_items_bom_id        ON public.bom_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_items_ingredient_id ON public.bom_items(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_bom_items_sort_order    ON public.bom_items(bom_id, sort_order);

-- Rename product index for sku_code
DROP INDEX IF EXISTS public.idx_products_sku;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_code ON public.products(sku_code);
