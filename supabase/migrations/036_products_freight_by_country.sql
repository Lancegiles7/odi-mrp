-- Country-specific freight on products.
--
-- Products are manufactured in one country and shipped to the other, so the
-- freight that lands in each market differs (e.g. snacks made in AUS carry real
-- freight to NZ but almost none to the Aus DC; puffs/melts are the reverse).
-- The old single `products.freight` column couldn't express that.
--
-- We add freight_nz / freight_au (both NZD per unit, like every other cost
-- input — the AU figure is converted to AUD via FX in the costing layer).
-- Existing freight is copied into BOTH so nothing changes until someone edits
-- the values. The legacy `freight` column is left in place for back-compat.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS freight_nz numeric(12, 4),
  ADD COLUMN IF NOT EXISTS freight_au numeric(12, 4);

-- Seed both from the current single value (only where not already set).
UPDATE public.products
   SET freight_nz = COALESCE(freight_nz, freight),
       freight_au = COALESCE(freight_au, freight);

COMMENT ON COLUMN public.products.freight_nz IS 'Freight cost per unit for NZ sales (NZD). Stored input.';
COMMENT ON COLUMN public.products.freight_au IS 'Freight cost per unit for AU sales (NZD; converted to AUD via FX in costing). Stored input.';
COMMENT ON COLUMN public.products.freight    IS 'Legacy single freight value (NZD). Superseded by freight_nz / freight_au; retained for back-compat.';
