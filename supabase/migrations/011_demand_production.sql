-- ============================================================
-- Odi MRP — Demand planning + Production schedule
-- Migration: 011_demand_production.sql
--
-- Adds:
--   • public.demand_forecasts          — monthly demand per product per channel
--   • public.production_plans          — monthly planned production per product
--   • public.products.manufacturer     — pack manufacturer (Brand Nation / I Eat Fresh / Flavour Makers / …)
--   • public.products.opening_stock_override — manual opening-stock override per SKU
--
-- Rolling balance calc (computed in the app, not stored):
--   opening  = coalesce(opening_stock_override, inventory_balances.quantity_on_hand, 0)
--   balance[m] = (m == first ? opening : balance[m-1])
--              + production_plans.units_planned
--              - sum(demand_forecasts.units for m across all channels + pipefill)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. DEMAND_FORECASTS
-- One row per (product, month, channel). Grand Total is computed
-- in the app by summing all channels for a given (product, month).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.demand_forecasts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  year_month  date        NOT NULL,       -- always day 1 of the month (e.g. 2026-04-01)
  channel     text        NOT NULL,
  units       integer     NOT NULL DEFAULT 0 CHECK (units >= 0),
  is_edited   boolean     NOT NULL DEFAULT false,   -- true when user has modified since last import
  source      text        NOT NULL DEFAULT 'manual',
  updated_by  uuid        REFERENCES public.user_profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_demand_channel CHECK (
    channel IN ('ecomm_nz', 'retail_nz', 'ecomm_au', 'retail_au', 'pipefill')
  ),
  CONSTRAINT chk_demand_year_month_day1 CHECK (
    EXTRACT(DAY FROM year_month) = 1
  ),
  UNIQUE (product_id, year_month, channel)
);

COMMENT ON TABLE  public.demand_forecasts IS 'Monthly demand per product per channel. Pipefill is a manually-entered channel.';
COMMENT ON COLUMN public.demand_forecasts.is_edited IS 'True if the user edited the cell after import. Preserved on re-import (import does not overwrite edited cells).';
COMMENT ON COLUMN public.demand_forecasts.source    IS 'manual | pipefill | import:<yyyy-mm-dd>';

CREATE INDEX IF NOT EXISTS idx_demand_product_month ON public.demand_forecasts(product_id, year_month);
CREATE INDEX IF NOT EXISTS idx_demand_year_month    ON public.demand_forecasts(year_month);


-- ============================================================
-- 2. PRODUCTION_PLANS
-- One row per (product, month). Nullable units_planned means
-- "not yet decided" which is different from 0 (planned to make none).
-- For simplicity we store units_planned as integer default 0.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.production_plans (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  year_month     date        NOT NULL,
  units_planned  integer     NOT NULL DEFAULT 0 CHECK (units_planned >= 0),
  notes          text,
  updated_by     uuid        REFERENCES public.user_profiles(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_production_year_month_day1 CHECK (
    EXTRACT(DAY FROM year_month) = 1
  ),
  UNIQUE (product_id, year_month)
);

COMMENT ON TABLE public.production_plans IS 'Planned production units per product per month. Balance = prev + production − demand.';

CREATE INDEX IF NOT EXISTS idx_production_product_month ON public.production_plans(product_id, year_month);
CREATE INDEX IF NOT EXISTS idx_production_year_month    ON public.production_plans(year_month);


-- ============================================================
-- 3. PRODUCTS — add manufacturer + opening_stock_override
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS manufacturer            text,
  ADD COLUMN IF NOT EXISTS opening_stock_override  numeric(12, 4);

COMMENT ON COLUMN public.products.manufacturer IS 'Pack manufacturer / toller, e.g. Brand Nation, I Eat Fresh, Flavour Makers. Free text for flexibility.';
COMMENT ON COLUMN public.products.opening_stock_override IS 'Manual opening-stock override for the Production page. When NULL, falls back to inventory_balances.quantity_on_hand.';

CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON public.products(manufacturer)
  WHERE manufacturer IS NOT NULL;


-- ============================================================
-- 4. RLS
-- Read: all authenticated. Write: admin + operations + supply_chain + finance.
-- Same convention as products_write.
-- ============================================================
ALTER TABLE public.demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demand_select_authenticated" ON public.demand_forecasts;
CREATE POLICY "demand_select_authenticated"
  ON public.demand_forecasts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "demand_write" ON public.demand_forecasts;
CREATE POLICY "demand_write"
  ON public.demand_forecasts FOR ALL
  TO authenticated
  USING      (public.current_user_role() IN ('admin', 'operations', 'supply_chain', 'finance'))
  WITH CHECK (public.current_user_role() IN ('admin', 'operations', 'supply_chain', 'finance'));

DROP POLICY IF EXISTS "production_select_authenticated" ON public.production_plans;
CREATE POLICY "production_select_authenticated"
  ON public.production_plans FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "production_write" ON public.production_plans;
CREATE POLICY "production_write"
  ON public.production_plans FOR ALL
  TO authenticated
  USING      (public.current_user_role() IN ('admin', 'operations', 'supply_chain'))
  WITH CHECK (public.current_user_role() IN ('admin', 'operations', 'supply_chain'));


-- ============================================================
-- 5. updated_at triggers — reuse public.set_updated_at() from 001
-- ============================================================
DROP TRIGGER IF EXISTS trg_demand_forecasts_updated_at ON public.demand_forecasts;
CREATE TRIGGER trg_demand_forecasts_updated_at
  BEFORE UPDATE ON public.demand_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_production_plans_updated_at ON public.production_plans;
CREATE TRIGGER trg_production_plans_updated_at
  BEFORE UPDATE ON public.production_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
