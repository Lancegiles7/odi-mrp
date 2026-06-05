-- ============================================================
-- 032 — Split pipefill channel into pipefill_nz / pipefill_au
--
-- Existing 'pipefill' rows are treated as NZ (per the product
-- owner's spec — all current pipefill data was entered in the
-- NZ-only era). A new 'pipefill_au' channel becomes available
-- so AUS pipefill can be tracked separately.
--
-- Steps (ORDER MATTERS):
--   1. DROP the old CHECK constraint first. If we UPDATE'd rows
--      to 'pipefill_nz' while the old constraint was still in
--      place, Postgres would reject the new value (the old
--      constraint only allows 'pipefill'). The transaction would
--      roll back with a 23514 check_constraint_violation error.
--   2. UPDATE the rows now that the constraint is gone.
--   3. ADD the new CHECK constraint with the expanded value set.
--
-- Pure relabel + add. No data loss. Idempotent guards so it's
-- safe to re-run.
-- ============================================================

BEGIN;

-- 1. Drop the old constraint FIRST so the UPDATE isn't blocked.
alter table public.demand_forecasts
  drop constraint if exists chk_demand_channel;

-- 2. Relabel existing pipefill rows as NZ.
update public.demand_forecasts
set channel = 'pipefill_nz'
where channel = 'pipefill';

-- 3. Add the new constraint with the expanded allowed values.
alter table public.demand_forecasts
  add constraint chk_demand_channel
  check (channel in (
    'ecomm_nz', 'retail_nz',
    'ecomm_au', 'retail_au',
    'pipefill_nz', 'pipefill_au'
  ));

COMMIT;
