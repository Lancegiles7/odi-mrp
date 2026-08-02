-- "Made in" — where a product is manufactured, so its cost can be built in the
-- right currency.
--
--   NZ   (default) — made by Brand Nation. Cost built in NZD; AUD = NZD ÷ FX.
--                    Every existing single-manufacture product.
--   AU             — made at VMC only. Cost built in AUD (VMC toll, AU packaging,
--                    AU ingredient landed costs); the NZD figure is AUD × FX, so
--                    NZD reporting/margin still works — just derived the other way.
--   BOTH           — dual build (NZ + AU side by side), today's behaviour.
--
-- Safe to run BEFORE the code deploy: old code ignores the column, and new code
-- reads it. Single phase. Idempotent.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS manufacture_market text NOT NULL DEFAULT 'NZ';

-- Guard the allowed values (added separately so re-runs don't error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_manufacture_market_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_manufacture_market_check
      CHECK (manufacture_market IN ('NZ','AU','BOTH'));
  END IF;
END $$;

COMMENT ON COLUMN public.products.manufacture_market IS
  'Where the product is made: NZ (Brand Nation, default) · AU (VMC only — cost '
  'built in AUD, NZD = AUD × FX) · BOTH (dual build).';

-- Existing dual products (an AU manufacturer already set) → BOTH.
UPDATE public.products
SET manufacture_market = 'BOTH'
WHERE manufacturer_au IS NOT NULL
  AND trim(manufacturer_au) <> ''
  AND manufacture_market = 'NZ';
