-- ============================================================
-- 032 — Split pipefill channel into pipefill_nz / pipefill_au
--
-- Existing 'pipefill' rows are treated as NZ (per the product
-- owner's spec — all current pipefill data was entered in the
-- NZ-only era). A new 'pipefill_au' channel becomes available
-- so AUS pipefill can be tracked separately.
--
-- Steps:
--   1. Rename existing pipefill rows → pipefill_nz
--   2. Replace the CHECK constraint to allow both new values
--      (Postgres requires DROP + ADD for CHECK changes).
--   3. (Budget snapshot table also needs its channel mapping
--      updated in code — handled in actions.ts, not SQL.)
--
-- Pure relabel + add. No data loss. Idempotent guards so it's
-- safe to re-run.
-- ============================================================

BEGIN;

-- 1. Relabel existing rows.
update public.demand_forecasts
set channel = 'pipefill_nz'
where channel = 'pipefill';

-- 2. Swap the CHECK constraint.
alter table public.demand_forecasts
  drop constraint if exists chk_demand_channel;

alter table public.demand_forecasts
  add constraint chk_demand_channel
  check (channel in (
    'ecomm_nz', 'retail_nz',
    'ecomm_au', 'retail_au',
    'pipefill_nz', 'pipefill_au'
  ));

COMMIT;
