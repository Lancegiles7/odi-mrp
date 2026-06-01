-- ============================================================
-- 029 — Per-cell comments on demand and production grids
--
-- Polymorphic, append-only comment log keyed by (entity_type,
-- entity_id, year_month). The UI surfaces these on the Ingredient
-- demand, Packaging demand, and Production pages — visible only on
-- short / amber cells, so the "+" never clutters comfortable cells.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.demand_cell_comments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text        NOT NULL CHECK (entity_type IN ('ingredient', 'packaging', 'product')),
  entity_id     uuid        NOT NULL,
  year_month    date        NOT NULL,
  comment       text        NOT NULL,
  changed_by    uuid        REFERENCES public.user_profiles(id),
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dcc_entity_month
  ON public.demand_cell_comments(entity_type, entity_id, year_month);
CREATE INDEX IF NOT EXISTS idx_dcc_changed_at
  ON public.demand_cell_comments(changed_at DESC);

COMMENT ON TABLE public.demand_cell_comments IS
  'Append-only comments per (entity, month) cell. Polymorphic via entity_type.';

COMMIT;
