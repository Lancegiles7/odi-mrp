-- ============================================================
-- 069_ingredient_category_manufacturer_supplied.sql
--
-- New ingredient category: 'manufacturer_supplied' — bought and supplied by
-- the contract manufacturer, so Odi never orders or holds it. It still costs
-- in the product BOM (you pay for it through the manufacturer), but it's left
-- out of procurement: Stock Movements, Ingredient Demand, the dashboard
-- ingredient strip and the PO ingredient picker. 'snack' is treated the same.
--
-- Only 'purchased' ingredients are procured from here on.
-- Safe to run before the code deploy. Idempotent. No existing rows change.
-- ============================================================

-- The 039 CHECK was declared inline, so drop whatever check constraint sits
-- on the category column by lookup rather than by a guessed name.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.ingredients'::regclass
      AND con.contype  = 'c'
      AND att.attname  = 'category'
  LOOP
    EXECUTE format('ALTER TABLE public.ingredients DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_category_check
  CHECK (category IN ('purchased', 'snack', 'manufacturer_supplied'));

COMMENT ON COLUMN public.ingredients.category IS
  'purchased (Odi buys it — procured, stock-counted) | snack (supplied by the snack manufacturer, AUD) | '
  'manufacturer_supplied (bought by the contract manufacturer). Only purchased is procured.';
