-- Ingredient category.
--
-- Distinguishes ingredients Odi buys directly ('purchased') from those supplied
-- by a contract manufacturer as part of a finished product's recipe ('snack' —
-- the snack manufacturer's ingredients, billed to Odi in AUD). Snack ingredients
-- are managed and priced separately (AUD) but live in the same ingredients list,
-- filterable by category.
--
-- Extensible: add new categories to the CHECK list + INGREDIENT_CATEGORIES const
-- when other manufacturer groups (puffs/melts, etc.) need their own bucket.

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'purchased'
    CHECK (category IN ('purchased', 'snack'));

COMMENT ON COLUMN public.ingredients.category IS 'purchased (bought directly) | snack (supplied by the snack manufacturer, AUD).';
