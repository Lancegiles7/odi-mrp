-- ============================================================
-- 026 — Single source of truth for AUD → NZD
--
-- Previously the app had TWO independent AUD rates:
--   * app_settings.fx_rate            (e.g. 1.20)  — used by costing
--   * app_settings.fx_rates['AUD']    (e.g. 1.0833) — used to load
--                                                     AUD-priced inputs
-- This one-shot promotes the legacy single field into the JSON map so
-- AUD has one canonical value. After this, the standalone fx_rate
-- column is no longer read; the settings UI only exposes the multi-
-- currency table. The column is retained for safety / older snapshots.
-- ============================================================

BEGIN;

UPDATE public.app_settings
SET fx_rates = jsonb_set(
      COALESCE(fx_rates::jsonb, '{}'::jsonb),
      '{AUD}',
      to_jsonb(fx_rate)
    )::json
WHERE id = 1
  AND fx_rate IS NOT NULL;

COMMIT;
