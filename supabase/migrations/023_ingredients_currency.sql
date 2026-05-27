-- ============================================================
-- 023 — Add currency + fx_rate_override to ingredients
--
-- Mirrors the columns migration 017 added to packaging. With these,
-- ingredient price can be entered in any supported currency, and the
-- total_loaded_cost is computed as price × FX + freight using the
-- rate from app_settings.fx_rates (with optional per-ingredient
-- override).
--
-- Existing ingredients backfill to 'NZD' (with FX = 1.0), preserving
-- current behaviour — price stays as-is.
-- ============================================================

BEGIN;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NZD'
    CHECK (currency IN ('NZD', 'AUD', 'USD', 'EUR', 'GBP')),
  ADD COLUMN IF NOT EXISTS fx_rate_override numeric(12, 6);

COMMENT ON COLUMN public.ingredients.currency         IS
  'Currency the supplier price is denominated in. FX → NZD via app_settings.fx_rates (or fx_rate_override).';
COMMENT ON COLUMN public.ingredients.fx_rate_override IS
  'Per-ingredient FX override (multiplier to NZD). NULL = use the rate stored in app_settings.fx_rates for the chosen currency.';

COMMIT;
