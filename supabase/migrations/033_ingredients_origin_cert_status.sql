-- ============================================================
-- 033 — Ingredients: origin, certification, at_risk status
--
-- Three small schema additions to support the Ingredients overhaul:
--   1. ingredients.origin           (text — free-form country)
--   2. ingredients.certification    (text — gfsi | haccp | brc |
--                                    iso_22000 | fssc_22000 | null)
--   3. Expand the status CHECK to allow 'at_risk' alongside
--      confirmed / pending / inactive.
--
-- Pure additive. No data loss. Idempotent.
-- ============================================================

BEGIN;

-- 1. New columns.
alter table public.ingredients
  add column if not exists origin        text,
  add column if not exists certification text;

-- 2. Certification CHECK — null allowed (no cert on file).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_ingredient_certification'
      and conrelid = 'public.ingredients'::regclass
  ) then
    alter table public.ingredients
      add constraint chk_ingredient_certification
      check (certification is null or certification in ('gfsi', 'haccp', 'brc', 'iso_22000', 'fssc_22000'));
  end if;
end $$;

-- 3. Status CHECK — add 'at_risk' to the allowed set.
--    Existing constraint is named differently across migrations; drop
--    the well-known one and re-add. If yours is named differently the
--    DROP IF EXISTS is a no-op and the ADD succeeds.
alter table public.ingredients
  drop constraint if exists chk_ingredient_status;
alter table public.ingredients
  drop constraint if exists ingredients_status_check;

alter table public.ingredients
  add constraint chk_ingredient_status
  check (status in ('confirmed', 'at_risk', 'pending', 'inactive'));

-- Helpful comment for future readers.
comment on column public.ingredients.origin        is 'Country of origin (free-text). Shown on the ingredients list and detail page.';
comment on column public.ingredients.certification is 'Food-safety certification on file. One of: gfsi, haccp, brc, iso_22000, fssc_22000. Null when no cert recorded.';

COMMIT;
