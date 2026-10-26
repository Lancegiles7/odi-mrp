-- 080 — provenance on production plans
--
-- The Production auto-planner ("Suggest production") writes model-driven
-- numbers into production_plans. We need to tell, per cell, whether a number
-- came from the model or from a person, so the schedule can show it as a
-- draft suggestion (dashed violet) vs a confirmed number (solid), and so the
-- per-manufacturer Accept-all / Clear controls can act only on model cells.
--
--  source          'manual'    — a person typed or kept this number (default)
--                  'suggested' — the model put it here; not yet confirmed
--  suggested_units  the model's last number for this cell, kept even after a
--                   person overrides it, so the schedule can show the model's
--                   figure (greyed) beside the person's until they decide.

alter table production_plans
  add column if not exists source text not null default 'manual',
  add column if not exists suggested_units integer;

alter table production_plans
  drop constraint if exists production_plans_source_check;
alter table production_plans
  add constraint production_plans_source_check check (source in ('manual', 'suggested'));

-- Fast lookup for the Accept-all / Clear actions (model cells only).
create index if not exists production_plans_suggested_idx
  on production_plans (product_id, source)
  where source = 'suggested';
