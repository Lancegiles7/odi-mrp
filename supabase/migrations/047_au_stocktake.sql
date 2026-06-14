-- Per-market stocktake (opening stock) for ingredients and packaging.
--
-- Until now each ingredient / packaging item had a single opening_stock_override
-- (the NZ stocktake). With the NZ/AU split, the Australian build is checked
-- against a separate Australian stocktake. We add an AU opening-stock column and
-- tag the edit-history rows with the market they belong to.
--
-- Existing data is the NZ stocktake (column unchanged) and existing history rows
-- default to market = 'NZ', so nothing changes for the NZ / combined views.

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS opening_stock_override_au numeric(14, 4);
ALTER TABLE public.packaging
  ADD COLUMN IF NOT EXISTS opening_stock_override_au numeric(14, 4);

COMMENT ON COLUMN public.ingredients.opening_stock_override_au IS 'Australian stocktake (manual opening stock for the AU build). NZ stocktake stays on opening_stock_override.';
COMMENT ON COLUMN public.packaging.opening_stock_override_au   IS 'Australian stocktake (manual opening stock for the AU build). NZ stocktake stays on opening_stock_override.';

-- Tag stock-history rows with their market so each stocktake keeps its own
-- audit trail / clock button.
ALTER TABLE public.ingredient_opening_stock_history
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'NZ';
ALTER TABLE public.packaging_opening_stock_history
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'NZ';

ALTER TABLE public.ingredient_opening_stock_history
  DROP CONSTRAINT IF EXISTS ingredient_osh_market_check;
ALTER TABLE public.ingredient_opening_stock_history
  ADD CONSTRAINT ingredient_osh_market_check CHECK (market IN ('NZ', 'AU'));
ALTER TABLE public.packaging_opening_stock_history
  DROP CONSTRAINT IF EXISTS packaging_osh_market_check;
ALTER TABLE public.packaging_opening_stock_history
  ADD CONSTRAINT packaging_osh_market_check CHECK (market IN ('NZ', 'AU'));
