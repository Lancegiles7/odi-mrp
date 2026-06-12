-- Per-maker production planning. A dual-build product is made by two
-- manufacturers (Brand Nation = NZ, VMC = AU), so its build volume is planned
-- separately per maker. We tag production_plans with a `market`.
--
-- Everything existing becomes market = 'NZ', so single-build products are
-- unchanged. A dual product can now hold an NZ plan (Brand Nation) and an AU
-- plan (VMC) for the same month.

ALTER TABLE public.production_plans
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'NZ';

ALTER TABLE public.production_plans
  DROP CONSTRAINT IF EXISTS production_plans_product_id_year_month_key;
ALTER TABLE public.production_plans
  ADD CONSTRAINT production_plans_product_month_market_key UNIQUE (product_id, year_month, market);

ALTER TABLE public.production_plans
  DROP CONSTRAINT IF EXISTS production_plans_market_check;
ALTER TABLE public.production_plans
  ADD CONSTRAINT production_plans_market_check CHECK (market IN ('NZ', 'AU'));

COMMENT ON COLUMN public.production_plans.market IS 'Which build this plan is for: NZ (Brand Nation) or AU (VMC). One plan per (product, month, market).';
