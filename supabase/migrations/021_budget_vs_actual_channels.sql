-- ============================================================
-- 021 — Budget vs Actual: per-channel budget breakdown
--
-- The original migration 020 stored budget as a single grand-total per
-- (product, year_month). But demand_forecasts already has channel-level
-- detail (ecomm_nz / retail_nz / pipefill / ecomm_au / retail_au), so
-- the budget snapshot should preserve that breakdown to allow per-channel
-- variance reads.
--
-- Channel mapping (demand_forecasts → bva_budget_snapshots):
--   ecomm_nz   → nz_d2c
--   retail_nz  → nz_retail
--   pipefill   → nz_samples   (pipefill covers samples + supply buffer)
--   ecomm_au   → au_d2c
--   retail_au  → au_retail
-- ============================================================

BEGIN;

-- Drop existing budget data — was stored as grand-total only, must be re-snapshot
TRUNCATE public.bva_budget_snapshots;

-- Drop the old (product_id, year_month) uniqueness so we can add (channel)
ALTER TABLE public.bva_budget_snapshots
  DROP CONSTRAINT IF EXISTS bva_budget_snapshots_product_id_year_month_key;

-- Add channel column (matches product_actuals.channel exactly so per-channel
-- variance is straightforward)
ALTER TABLE public.bva_budget_snapshots
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'nz_d2c'
    CHECK (channel IN ('nz_retail','nz_d2c','nz_samples','au_retail','au_d2c','au_samples'));

-- Drop the temporary default once the column exists (so future inserts must
-- specify channel explicitly).
ALTER TABLE public.bva_budget_snapshots
  ALTER COLUMN channel DROP DEFAULT;

-- New uniqueness includes channel
ALTER TABLE public.bva_budget_snapshots
  ADD CONSTRAINT bva_budget_snapshots_unique UNIQUE (product_id, year_month, channel);

CREATE INDEX IF NOT EXISTS idx_bva_budget_snapshots_lookup
  ON public.bva_budget_snapshots(product_id, year_month);

COMMIT;
