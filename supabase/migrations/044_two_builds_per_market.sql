-- Two builds per market (Phase 2) — one product, an NZ build (Brand Nation) and
-- an optional AU build (VMC), each with its own recipe + packaging + toll.
--
-- We tag BOMs and packaging links with a `market`. A product always has an NZ
-- build; an AU build is added on demand (seeded as a copy of NZ, then edited).
-- Everything existing becomes market = 'NZ', so single-build products are
-- completely unchanged. The AU path only activates once an AU build exists.

-- 1) BOMs gain a market. The old UNIQUE(product_id, version) would block a
--    second market reusing version 1, so widen it to include market.
ALTER TABLE public.boms
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'NZ';
ALTER TABLE public.boms
  DROP CONSTRAINT IF EXISTS boms_product_id_version_key;
ALTER TABLE public.boms
  ADD CONSTRAINT boms_product_market_version_key UNIQUE (product_id, market, version);
ALTER TABLE public.boms
  DROP CONSTRAINT IF EXISTS boms_market_check;
ALTER TABLE public.boms
  ADD CONSTRAINT boms_market_check CHECK (market IN ('NZ', 'AU'));

COMMENT ON COLUMN public.boms.market IS 'Which build this recipe belongs to: NZ (Brand Nation) or AU (VMC). One active BOM per (product, market).';

-- 2) Packaging links gain a market, so the AU build can use different packs.
ALTER TABLE public.product_packaging
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'NZ';
ALTER TABLE public.product_packaging
  DROP CONSTRAINT IF EXISTS product_packaging_product_id_packaging_id_key;
ALTER TABLE public.product_packaging
  ADD CONSTRAINT product_packaging_product_pkg_market_key UNIQUE (product_id, packaging_id, market);
ALTER TABLE public.product_packaging
  DROP CONSTRAINT IF EXISTS product_packaging_market_check;
ALTER TABLE public.product_packaging
  ADD CONSTRAINT product_packaging_market_check CHECK (market IN ('NZ', 'AU'));

COMMENT ON COLUMN public.product_packaging.market IS 'Which build this packaging belongs to: NZ or AU. Same packaging item can appear in both markets.';

-- 3) AU packaging cost rollup (NZD, like products.packaging). Computed from the
--    market = 'AU' packaging links; falls back to products.packaging in costing
--    when the AU build has no packaging of its own.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS packaging_au numeric(12, 4);

COMMENT ON COLUMN public.products.packaging_au IS 'AU build packaging cost per unit (NZD rollup of market = AU links; converted to AUD in costing). Blank → AU build uses the NZ packaging cost.';
