-- ============================================================
-- Stock Movements for ingredients & packaging — manual period entries.
--
-- One row per item (ingredient|packaging) × month × country (NZ|AU) holding:
--   • wastage_units (+ comment) — stock lost/spoiled that month
--   • counted_units (+ comment) — the month-end ACTUAL count, which overrides
--     the system EOM and carries forward as the next month's opening.
-- End-of-July counts seed the ledger (raw data); August onward is forecast.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stock_period_adjustments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     text        NOT NULL,
  entity_id       uuid        NOT NULL,
  year_month      date        NOT NULL,          -- day 1 of the month
  market          text        NOT NULL,
  wastage_units   numeric(14,4) NOT NULL DEFAULT 0,
  wastage_comment text,
  counted_units   numeric(14,4),                 -- NULL = no override this month
  count_comment   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES public.user_profiles(id),

  CONSTRAINT stock_period_adjustments_entity_check CHECK (entity_type IN ('ingredient','packaging')),
  CONSTRAINT stock_period_adjustments_market_check CHECK (market IN ('NZ','AU')),
  CONSTRAINT stock_period_adjustments_month_day1   CHECK (EXTRACT(DAY FROM year_month) = 1),
  UNIQUE (entity_type, entity_id, year_month, market)
);

CREATE INDEX IF NOT EXISTS idx_stock_period_adj_entity
  ON public.stock_period_adjustments (entity_type, entity_id);

CREATE TRIGGER trg_stock_period_adjustments_updated_at
  BEFORE UPDATE ON public.stock_period_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_period_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_period_adj_select" ON public.stock_period_adjustments;
CREATE POLICY "stock_period_adj_select" ON public.stock_period_adjustments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "stock_period_adj_write" ON public.stock_period_adjustments;
CREATE POLICY "stock_period_adj_write" ON public.stock_period_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.stock_period_adjustments IS 'Manual month-end entries for the ingredient/packaging Stock Movements ledger: wastage and the actual counted EOM (with comments), per item/month/country.';
