-- ============================================================
-- 020 — Budget vs Actual reporting
--
-- New tables to support the FY-anchored monthly budget-vs-actual
-- review across products, ingredients, packaging.
--
-- 1. budget_snapshots         — frozen demand at FY start (so editing
--                                the live forecast doesn't move the budget)
-- 2. product_actuals          — channel-split monthly sales (NZ Retail /
--                                D2C / Samples; AU equivalents reserved)
-- 3. monthly_stock_counts     — counted EOM and (for FY-start) opening SOH
--                                per entity per month. Auto-roll: month M+1
--                                opening = month M counted EOM, falling back
--                                to the system-calculated EOM if blank.
-- 4. monthly_consumption_overrides — manual override for ingredient/packaging
--                                derived consumption (with comment)
-- 5. month_locks              — once a month is "locked" it's read-only;
--                                admin can unlock to fix mistakes
-- ============================================================

BEGIN;

-- 1. Budget snapshots (renamed bva_* to avoid clash with the Budget
--    Dashboard's existing budget_snapshots table from migration 015,
--    which serves a completely different purpose).
CREATE TABLE IF NOT EXISTS public.bva_budget_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  year_month   date NOT NULL,
  units        numeric(14, 4) NOT NULL,
  snapshot_at  timestamptz NOT NULL DEFAULT now(),
  snapshot_by  uuid REFERENCES public.user_profiles(id),
  UNIQUE (product_id, year_month)
);
CREATE INDEX IF NOT EXISTS idx_bva_budget_snapshots_year_month ON public.bva_budget_snapshots(year_month);

-- 2. Product actuals — channel-split monthly sales
CREATE TABLE IF NOT EXISTS public.product_actuals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  year_month   date NOT NULL,
  channel      text NOT NULL CHECK (channel IN (
    'nz_retail', 'nz_d2c', 'nz_samples',
    'au_retail', 'au_d2c', 'au_samples'
  )),
  units        numeric(14, 4) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.user_profiles(id),
  UNIQUE (product_id, year_month, channel)
);
CREATE INDEX IF NOT EXISTS idx_product_actuals_year_month ON public.product_actuals(year_month);
CREATE TRIGGER trg_product_actuals_updated_at BEFORE UPDATE ON public.product_actuals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Monthly stock counts — counted EOM + (for FY start) opening SOH
CREATE TABLE IF NOT EXISTS public.monthly_stock_counts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text NOT NULL CHECK (entity_type IN ('product', 'ingredient', 'packaging')),
  entity_id     uuid NOT NULL,
  year_month    date NOT NULL,
  counted_eom   numeric(14, 4),
  opening_soh   numeric(14, 4),
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.user_profiles(id),
  UNIQUE (entity_type, entity_id, year_month)
);
CREATE INDEX IF NOT EXISTS idx_monthly_stock_counts_lookup ON public.monthly_stock_counts(entity_type, entity_id, year_month);
CREATE INDEX IF NOT EXISTS idx_monthly_stock_counts_year_month ON public.monthly_stock_counts(year_month);
CREATE TRIGGER trg_monthly_stock_counts_updated_at BEFORE UPDATE ON public.monthly_stock_counts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Override consumption for ingredients/packaging
CREATE TABLE IF NOT EXISTS public.monthly_consumption_overrides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL CHECK (entity_type IN ('ingredient', 'packaging')),
  entity_id      uuid NOT NULL,
  year_month     date NOT NULL,
  override_units numeric(14, 4) NOT NULL,
  comment        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.user_profiles(id),
  UNIQUE (entity_type, entity_id, year_month)
);
CREATE INDEX IF NOT EXISTS idx_monthly_consumption_overrides_lookup ON public.monthly_consumption_overrides(entity_type, entity_id, year_month);
CREATE TRIGGER trg_monthly_consumption_overrides_updated_at BEFORE UPDATE ON public.monthly_consumption_overrides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Month locks
CREATE TABLE IF NOT EXISTS public.month_locks (
  year_month  date PRIMARY KEY,
  locked_at   timestamptz NOT NULL DEFAULT now(),
  locked_by   uuid REFERENCES public.user_profiles(id),
  notes       text
);

-- 6. RLS — authenticated users have full access (matches the rest of the app)
ALTER TABLE public.bva_budget_snapshots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_actuals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_stock_counts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_consumption_overrides  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.month_locks                    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bva_budget_snapshots_select_authenticated" ON public.bva_budget_snapshots;
CREATE POLICY "bva_budget_snapshots_select_authenticated" ON public.bva_budget_snapshots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bva_budget_snapshots_write_authenticated" ON public.bva_budget_snapshots;
CREATE POLICY "bva_budget_snapshots_write_authenticated" ON public.bva_budget_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "product_actuals_select_authenticated" ON public.product_actuals;
CREATE POLICY "product_actuals_select_authenticated" ON public.product_actuals FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "product_actuals_write_authenticated" ON public.product_actuals;
CREATE POLICY "product_actuals_write_authenticated" ON public.product_actuals FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "monthly_stock_counts_select_authenticated" ON public.monthly_stock_counts;
CREATE POLICY "monthly_stock_counts_select_authenticated" ON public.monthly_stock_counts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "monthly_stock_counts_write_authenticated" ON public.monthly_stock_counts;
CREATE POLICY "monthly_stock_counts_write_authenticated" ON public.monthly_stock_counts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "monthly_consumption_overrides_select_authenticated" ON public.monthly_consumption_overrides;
CREATE POLICY "monthly_consumption_overrides_select_authenticated" ON public.monthly_consumption_overrides FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "monthly_consumption_overrides_write_authenticated" ON public.monthly_consumption_overrides;
CREATE POLICY "monthly_consumption_overrides_write_authenticated" ON public.monthly_consumption_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "month_locks_select_authenticated" ON public.month_locks;
CREATE POLICY "month_locks_select_authenticated" ON public.month_locks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "month_locks_write_authenticated" ON public.month_locks;
CREATE POLICY "month_locks_write_authenticated" ON public.month_locks FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
