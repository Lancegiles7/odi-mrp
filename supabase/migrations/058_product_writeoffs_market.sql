-- Write-offs per country (NZ / AU) for the NZ+AUS Stock Movements split.
-- Adds a market column and re-keys the uniqueness to (product, month, market)
-- so a product can have both an NZ and an AU write-off in the same month.
-- Existing write-offs are all NZ activity → default NZ.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.

ALTER TABLE public.product_writeoffs
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'NZ';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_writeoffs_market_check') THEN
    ALTER TABLE public.product_writeoffs
      ADD CONSTRAINT product_writeoffs_market_check CHECK (market IN ('NZ','AU'));
  END IF;
END $$;

-- Re-key uniqueness to include market.
ALTER TABLE public.product_writeoffs DROP CONSTRAINT IF EXISTS product_writeoffs_product_id_year_month_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_writeoffs_product_month_market_key') THEN
    ALTER TABLE public.product_writeoffs
      ADD CONSTRAINT product_writeoffs_product_month_market_key UNIQUE (product_id, year_month, market);
  END IF;
END $$;

COMMENT ON COLUMN public.product_writeoffs.market IS 'Country the write-off belongs to (NZ / AU) — drives the NZ/AUS Stock Movements rows.';
