-- Separate AU retail price.
--
-- Products carried a single `rrp` (NZ, inc GST). The AU margin was worked out
-- against that same NZD figure — a currency mismatch (AUD cost vs NZD price),
-- the revenue-side twin of the toll/margin issue fixed in migration 037.
--
-- Add `rrp_au` (AU retail price, inc GST, in AUD). Seed it equal to the existing
-- NZ rrp so nothing changes until someone sets a real AU price.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS rrp_au numeric(12, 4);

UPDATE public.products
   SET rrp_au = COALESCE(rrp_au, rrp);

COMMENT ON COLUMN public.products.rrp       IS 'NZ retail price, inc GST (NZD).';
COMMENT ON COLUMN public.products.rrp_au    IS 'AU retail price, inc GST (AUD). Defaults to the NZ rrp until set.';
