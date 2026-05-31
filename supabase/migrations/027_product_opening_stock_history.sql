-- ============================================================
-- 027 — Opening-stock override audit history
--
-- Append-only audit trail for products.opening_stock_override
-- edits. Mirrors the shape of ingredient_price_history (migration
-- 006). The Production page popover reads from this table to show
-- who changed the value, when, and any note left at the time.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_opening_stock_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  previous_value  numeric(14, 2),
  new_value       numeric(14, 2),
  note            text,
  changed_by      uuid        REFERENCES public.user_profiles(id),
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posh_product_id  ON public.product_opening_stock_history(product_id);
CREATE INDEX IF NOT EXISTS idx_posh_changed_at  ON public.product_opening_stock_history(changed_at DESC);

COMMENT ON TABLE  public.product_opening_stock_history IS
  'Append-only audit of products.opening_stock_override changes. One row per edit; note is optional.';

COMMIT;
