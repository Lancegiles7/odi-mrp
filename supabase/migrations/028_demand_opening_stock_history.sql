-- ============================================================
-- 028 — Opening-stock audit history for ingredients + packaging
--
-- Mirrors 027 (products). Each table is append-only and feeds the
-- shared opening-stock popover on the Ingredient demand and
-- Packaging demand pages.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ingredient_opening_stock_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id   uuid        NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  previous_value  numeric(14, 4),
  new_value       numeric(14, 4),
  note            text,
  changed_by      uuid        REFERENCES public.user_profiles(id),
  changed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iosh_ingredient_id ON public.ingredient_opening_stock_history(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_iosh_changed_at    ON public.ingredient_opening_stock_history(changed_at DESC);

CREATE TABLE IF NOT EXISTS public.packaging_opening_stock_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  packaging_id    uuid        NOT NULL REFERENCES public.packaging(id) ON DELETE CASCADE,
  previous_value  numeric(14, 4),
  new_value       numeric(14, 4),
  note            text,
  changed_by      uuid        REFERENCES public.user_profiles(id),
  changed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posh2_packaging_id ON public.packaging_opening_stock_history(packaging_id);
CREATE INDEX IF NOT EXISTS idx_posh2_changed_at   ON public.packaging_opening_stock_history(changed_at DESC);

COMMIT;
