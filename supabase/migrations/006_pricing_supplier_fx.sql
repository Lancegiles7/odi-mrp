-- ============================================================
-- Odi MRP — Pricing history, supplier FK, global FX/GST settings
-- Migration: 006_pricing_supplier_fx.sql
--
-- Adds:
--   • public.app_settings              — singleton (FX rate, NZ/AU GST rates)
--   • public.ingredient_price_history  — append-only price ledger
--   • public.suppliers.country_of_origin / country_of_purchase / currency
--   • public.ingredients.supplier_id FK (backfilled from confirmed_supplier text)
--   • public.products.apply_fx  (boolean, backfilled from currency_exchange > 0)
--   • public.products.wastage_pct (numeric fraction 0–1)
--   • CHECK constraint mapping product_type to the 7 product groups
--
-- Safety:
--   • Entire migration runs in a single transaction.
--   • Written as pure SQL — no DO / PL/pgSQL blocks.
--     (The Supabase SQL editor mis-parses dollar-quoted DO blocks.)
--   • Legacy columns (ingredients.confirmed_supplier, products.currency_exchange)
--     are NOT dropped — retained for one release. Drop them in 007.
--   • Idempotent: re-running this file is safe.
--   • Depends on migrations 001–005 being applied.
-- ============================================================

BEGIN;


-- ============================================================
-- 1. APP_SETTINGS — singleton row (id = 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  id          smallint      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fx_rate     numeric(8, 4) NOT NULL DEFAULT 1.2000,
  gst_nz_pct  numeric(5, 4) NOT NULL DEFAULT 0.1500,
  gst_au_pct  numeric(5, 4) NOT NULL DEFAULT 0.1000,
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  updated_by  uuid          REFERENCES public.user_profiles(id)
);

COMMENT ON TABLE  public.app_settings             IS 'Singleton row holding global FX rate and GST rates. Only id=1 is allowed.';
COMMENT ON COLUMN public.app_settings.fx_rate     IS 'Multiplier applied to NZ grand total when product.apply_fx = true.';
COMMENT ON COLUMN public.app_settings.gst_nz_pct  IS 'NZ GST rate as a fraction (0.15 = 15%). Used to strip GST from RRP for COS.';
COMMENT ON COLUMN public.app_settings.gst_au_pct  IS 'AU GST rate as a fraction (0.10 = 10%). Used to strip GST from RRP for COS.';

INSERT INTO public.app_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. SUPPLIERS — origin/purchase country + currency
-- ============================================================
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS country_of_origin    text,
  ADD COLUMN IF NOT EXISTS country_of_purchase  text,
  ADD COLUMN IF NOT EXISTS currency             text;

COMMENT ON COLUMN public.suppliers.country_of_origin   IS 'Where the ingredient is grown/produced.';
COMMENT ON COLUMN public.suppliers.country_of_purchase IS 'Country Odi buys from (drives currency).';
COMMENT ON COLUMN public.suppliers.currency            IS 'ISO 4217 code, e.g. AUD, NZD, USD, EUR.';


-- ============================================================
-- 3. INGREDIENTS.supplier_id FK
-- Legacy confirmed_supplier (text) is kept for one release.
-- ============================================================
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id);

CREATE INDEX IF NOT EXISTS idx_ingredients_supplier_id ON public.ingredients(supplier_id);

COMMENT ON COLUMN public.ingredients.supplier_id IS 'FK to suppliers. Preferred over confirmed_supplier (text) which is retained for one release.';


-- ============================================================
-- 4. BACKFILL suppliers from confirmed_supplier text.
--
-- Step 4a: insert a supplier row for every distinct confirmed_supplier
--          name that doesn't already exist (case-insensitive match).
--          The synthesised code is tagged with a short random suffix so
--          two distinct names with the same alphanumeric form still
--          produce unique codes.
-- ============================================================
WITH distinct_names AS (
  SELECT DISTINCT TRIM(confirmed_supplier) AS supplier_name
  FROM public.ingredients
  WHERE confirmed_supplier IS NOT NULL
    AND TRIM(confirmed_supplier) <> ''
    AND supplier_id IS NULL
),
needing_creation AS (
  SELECT dn.supplier_name
  FROM distinct_names dn
  WHERE NOT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE LOWER(s.name) = LOWER(dn.supplier_name)
  )
)
INSERT INTO public.suppliers (code, name, is_active)
SELECT
  LEFT(
    'SUP-' || UPPER(REGEXP_REPLACE(supplier_name, '[^A-Za-z0-9]+', '-', 'g')),
    44
  ) || '-' || SUBSTR(gen_random_uuid()::text, 1, 4) AS code,
  supplier_name,
  true
FROM needing_creation
ON CONFLICT (code) DO NOTHING;

-- Step 4b: link every ingredient to the supplier row that matches its
--          confirmed_supplier text (case-insensitive).
UPDATE public.ingredients AS i
SET supplier_id = s.id
FROM public.suppliers AS s
WHERE LOWER(TRIM(i.confirmed_supplier)) = LOWER(s.name)
  AND i.supplier_id IS NULL;


-- ============================================================
-- 5. INGREDIENT_PRICE_HISTORY — append-only ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ingredient_price_history (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id      uuid        NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  price              numeric(12, 4),
  freight            numeric(12, 4),
  total_loaded_cost  numeric(12, 4),
  change_reason      text        NOT NULL DEFAULT 'manual_update',
  changed_by         uuid        REFERENCES public.user_profiles(id),
  changed_at         timestamptz NOT NULL DEFAULT now(),
  notes              text,

  CONSTRAINT chk_change_reason CHECK (
    change_reason IN ('initial', 'manual_update', 'import', 'po_received', 'correction')
  )
);

CREATE INDEX IF NOT EXISTS idx_iph_ingredient_id ON public.ingredient_price_history(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_iph_changed_at    ON public.ingredient_price_history(changed_at DESC);

COMMENT ON TABLE  public.ingredient_price_history               IS 'Append-only price history. Latest row per ingredient is the current cost.';
COMMENT ON COLUMN public.ingredient_price_history.change_reason IS 'initial | manual_update | import | po_received | correction';

-- Seed one row per ingredient that has pricing — but only for
-- ingredients that don't already have any history rows (re-run safe).
INSERT INTO public.ingredient_price_history (
  ingredient_id, price, freight, total_loaded_cost, change_reason, changed_at
)
SELECT
  i.id, i.price, i.freight, i.total_loaded_cost, 'initial', COALESCE(i.created_at, now())
FROM public.ingredients i
WHERE (i.price IS NOT NULL OR i.freight IS NOT NULL OR i.total_loaded_cost IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.ingredient_price_history h WHERE h.ingredient_id = i.id
  );


-- ============================================================
-- 6. PRODUCTS — apply_fx, wastage_pct, product_type constraint
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS apply_fx    boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wastage_pct numeric(6, 4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.apply_fx    IS 'If true, NZ grand total multiplies base cost by app_settings.fx_rate. AU grand total never has FX applied.';
COMMENT ON COLUMN public.products.wastage_pct IS 'Applied to the ingredient subtotal (not per-line). 0.03 = 3%.';

-- Backfill apply_fx from the legacy currency_exchange dollar amount
UPDATE public.products
SET apply_fx = true
WHERE apply_fx = false
  AND currency_exchange IS NOT NULL
  AND currency_exchange > 0;

-- Normalise existing product_type values into the 7-group enum.
-- Already-normalised values are preserved (idempotent re-run).
UPDATE public.products SET product_type = CASE
  WHEN product_type IN (
    'pouches', 'snacks_4bs', 'puffs_melts', 'tubs',
    'sachets', 'noodles', 'vitamin_d'
  )                                                                  THEN product_type
  WHEN product_type ILIKE 'pouch%'                                   THEN 'pouches'
  WHEN product_type ILIKE '%4b%'   OR product_type ILIKE '%snack%'   THEN 'snacks_4bs'
  WHEN product_type ILIKE 'puff%'  OR product_type ILIKE '%melt%'    THEN 'puffs_melts'
  WHEN product_type ILIKE 'tub%'                                     THEN 'tubs'
  WHEN product_type ILIKE 'sachet%'                                  THEN 'sachets'
  WHEN product_type ILIKE 'noodle%'                                  THEN 'noodles'
  WHEN product_type ILIKE 'vitamin%'                                 THEN 'vitamin_d'
  ELSE NULL
END
WHERE product_type IS NOT NULL;

-- CHECK constraint (drop-and-recreate so re-runs don't error)
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS chk_product_type_group;

ALTER TABLE public.products
  ADD CONSTRAINT chk_product_type_group CHECK (
    product_type IS NULL OR product_type IN (
      'pouches', 'snacks_4bs', 'puffs_melts',
      'tubs', 'sachets', 'noodles', 'vitamin_d'
    )
  );

CREATE INDEX IF NOT EXISTS idx_products_product_type ON public.products(product_type);


-- ============================================================
-- 7. RLS on new tables (idempotent — drop-then-create)
-- Depends on public.current_user_role() from migration 002.
-- ============================================================
ALTER TABLE public.app_settings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_price_history ENABLE ROW LEVEL SECURITY;

-- app_settings: read for all authenticated, write admin only
DROP POLICY IF EXISTS "app_settings_select_authenticated" ON public.app_settings;
CREATE POLICY "app_settings_select_authenticated"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "app_settings_write_admin" ON public.app_settings;
CREATE POLICY "app_settings_write_admin"
  ON public.app_settings FOR ALL
  TO authenticated
  USING      (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ingredient_price_history: read all, insert for write roles, update/delete admin only
DROP POLICY IF EXISTS "iph_select_authenticated"  ON public.ingredient_price_history;
CREATE POLICY "iph_select_authenticated"
  ON public.ingredient_price_history FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "iph_insert" ON public.ingredient_price_history;
CREATE POLICY "iph_insert"
  ON public.ingredient_price_history FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'operations', 'supply_chain'));

DROP POLICY IF EXISTS "iph_admin_only_mutate" ON public.ingredient_price_history;
CREATE POLICY "iph_admin_only_mutate"
  ON public.ingredient_price_history FOR ALL
  TO authenticated
  USING      (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');


-- ============================================================
-- 8. updated_at trigger on app_settings
-- Reuses public.set_updated_at() from migration 001.
-- ============================================================
DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


COMMIT;
