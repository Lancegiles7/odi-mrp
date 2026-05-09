-- ============================================================
-- Odi MRP — Packaging
-- Migration: 017_packaging.sql
--
-- 1. packaging          — parallel to ingredients, with type + currency-aware loaded cost
-- 2. product_packaging  — many-to-many BOM link (product → packaging × qty per unit)
-- 3. stock_movements + inventory_balances  — add nullable packaging_id (mutex with ingredient_id)
-- 4. app_settings.fx_rates JSONB — manual currency table (NZD baseline)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. PACKAGING
-- ============================================================
CREATE TABLE IF NOT EXISTS public.packaging (
  id                       uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code                 text           NOT NULL UNIQUE,
  name                     text           NOT NULL,
  type                     text           NOT NULL DEFAULT 'OTHER',
  unit_of_measure          text           NOT NULL DEFAULT 'each',
  description              text,

  -- Supplier reference data — same pattern as ingredients
  supplier_id              uuid           REFERENCES public.suppliers(id),
  supplier_sku_code        text,
  supplier_pack_size       numeric(12, 4),
  supplier_pack_unit       text,

  -- Loaded cost components: price (in supplier's currency) + FX → NZD + freight
  price                    numeric(12, 4),    -- in supplier currency
  currency                 text           NOT NULL DEFAULT 'NZD' CHECK (currency IN ('NZD', 'AUD', 'USD', 'EUR', 'GBP')),
  fx_rate_override         numeric(12, 6),    -- per-item override; NULL = pull from app_settings.fx_rates
  freight_per_unit_nzd     numeric(12, 4),    -- NZD per unit
  total_loaded_cost_nzd    numeric(12, 4),    -- denormalised for fast reads; recalculated on save

  -- Inventory
  opening_stock_override   numeric(14, 4),
  reorder_point            numeric(12, 4),

  is_active                boolean        NOT NULL DEFAULT true,
  notes                    text,
  created_at               timestamptz    NOT NULL DEFAULT now(),
  updated_at               timestamptz    NOT NULL DEFAULT now(),
  created_by               uuid           REFERENCES public.user_profiles(id)
);

CREATE TRIGGER trg_packaging_updated_at
  BEFORE UPDATE ON public.packaging
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_packaging_supplier ON public.packaging(supplier_id);
CREATE INDEX IF NOT EXISTS idx_packaging_type     ON public.packaging(type);

COMMENT ON TABLE public.packaging IS 'Packaging items (flow wrap, box, pouch, SRT, etc.). Parallel to ingredients with currency + freight-aware loaded NZD cost.';
COMMENT ON COLUMN public.packaging.type                  IS 'Type code: FLOW_WRAP, BOX, POUCH_SNACKS, POUCH, SRT, OTHER. Free-text label rendered in UI from constants.';
COMMENT ON COLUMN public.packaging.fx_rate_override      IS 'Per-item FX override. NULL = use the rate stored in app_settings.fx_rates for the supplier currency.';
COMMENT ON COLUMN public.packaging.total_loaded_cost_nzd IS 'Denormalised: price × fx_rate + freight_per_unit_nzd. Recomputed on save by the application layer.';


-- ============================================================
-- 2. PRODUCT_PACKAGING — many-to-many BOM link
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_packaging (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid           NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  packaging_id        uuid           NOT NULL REFERENCES public.packaging(id),
  quantity_per_unit   numeric(12, 4) NOT NULL CHECK (quantity_per_unit > 0),
  notes               text,
  created_at          timestamptz    NOT NULL DEFAULT now(),

  UNIQUE (product_id, packaging_id)
);

CREATE INDEX IF NOT EXISTS idx_product_packaging_product   ON public.product_packaging(product_id);
CREATE INDEX IF NOT EXISTS idx_product_packaging_packaging ON public.product_packaging(packaging_id);

COMMENT ON TABLE  public.product_packaging IS 'Per-product packaging BOM. Each row = one packaging item used when this product is manufactured.';
COMMENT ON COLUMN public.product_packaging.quantity_per_unit IS 'How many of this packaging item are consumed per unit of product (e.g. 1, 0.25 for 4-pack box).';


-- ============================================================
-- 3. STOCK_MOVEMENTS + INVENTORY_BALANCES — add packaging_id
-- ============================================================
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS packaging_id uuid REFERENCES public.packaging(id);

ALTER TABLE public.inventory_balances
  ADD COLUMN IF NOT EXISTS packaging_id uuid REFERENCES public.packaging(id);

-- Allow ingredient_id to be nullable now (since packaging movements set packaging_id instead)
ALTER TABLE public.stock_movements    ALTER COLUMN ingredient_id DROP NOT NULL;
ALTER TABLE public.inventory_balances ALTER COLUMN ingredient_id DROP NOT NULL;

-- Exactly one of (ingredient_id, packaging_id) must be set
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS chk_stock_movement_target;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT chk_stock_movement_target CHECK (
    (CASE WHEN ingredient_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN packaging_id  IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

ALTER TABLE public.inventory_balances
  DROP CONSTRAINT IF EXISTS chk_inventory_balance_target;
ALTER TABLE public.inventory_balances
  ADD CONSTRAINT chk_inventory_balance_target CHECK (
    (CASE WHEN ingredient_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN packaging_id  IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

-- Drop the existing inventory_balances unique-by-ingredient index, recreate as
-- a unique-by-(target, location) index where target is whichever of ingredient_id/packaging_id is set.
DROP INDEX IF EXISTS inventory_balances_ingredient_id_location_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_balances_ing_loc
  ON public.inventory_balances(ingredient_id, location_id) WHERE ingredient_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_balances_pak_loc
  ON public.inventory_balances(packaging_id, location_id) WHERE packaging_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_packaging   ON public.stock_movements(packaging_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_packaging ON public.inventory_balances(packaging_id);


-- ============================================================
-- 4. STOCK BALANCE TRIGGER — extend to handle packaging_id
-- The existing apply_stock_movement() function only handles ingredient_id;
-- replace with one that branches on packaging_id too.
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ingredient_id IS NOT NULL THEN
    INSERT INTO public.inventory_balances (ingredient_id, location_id, quantity_on_hand, last_movement_at, updated_at)
    VALUES (NEW.ingredient_id, NEW.location_id, NEW.quantity, now(), now())
    ON CONFLICT (ingredient_id, location_id) DO UPDATE
      SET quantity_on_hand = public.inventory_balances.quantity_on_hand + NEW.quantity,
          last_movement_at = now(),
          updated_at       = now();
  ELSIF NEW.packaging_id IS NOT NULL THEN
    INSERT INTO public.inventory_balances (packaging_id, location_id, quantity_on_hand, last_movement_at, updated_at)
    VALUES (NEW.packaging_id, NEW.location_id, NEW.quantity, now(), now())
    ON CONFLICT (packaging_id, location_id) DO UPDATE
      SET quantity_on_hand = public.inventory_balances.quantity_on_hand + NEW.quantity,
          last_movement_at = now(),
          updated_at       = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 5. APP_SETTINGS — currency table (manual entry)
-- ============================================================
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS fx_rates jsonb NOT NULL DEFAULT
    '{"NZD": 1.0, "AUD": 1.0833, "USD": 1.62, "EUR": 1.78, "GBP": 2.05}'::jsonb;

COMMENT ON COLUMN public.app_settings.fx_rates IS 'Manual currency conversion rates. Each value is the multiplier to convert from the keyed currency to NZD (e.g. AUD: 1.0833 means 1 AUD = 1.0833 NZD).';


-- ============================================================
-- 6. PURCHASE ORDER LINES — support packaging
-- ============================================================
ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS packaging_id uuid REFERENCES public.packaging(id);

-- Replace the exactly-one-target constraint to include packaging_id
ALTER TABLE public.purchase_order_lines
  DROP CONSTRAINT IF EXISTS chk_po_line_target;

ALTER TABLE public.purchase_order_lines
  ADD CONSTRAINT chk_po_line_target CHECK (
    (CASE WHEN ingredient_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN product_id    IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN packaging_id  IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN description   IS NOT NULL AND length(trim(description)) > 0 THEN 1 ELSE 0 END) = 1
  );

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_packaging ON public.purchase_order_lines(packaging_id);


-- ============================================================
-- 7. RLS for new tables
-- ============================================================
ALTER TABLE public.packaging         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_packaging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "packaging_select_authenticated" ON public.packaging;
CREATE POLICY "packaging_select_authenticated" ON public.packaging FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "packaging_write_authenticated" ON public.packaging;
CREATE POLICY "packaging_write_authenticated" ON public.packaging FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "product_packaging_select_authenticated" ON public.product_packaging;
CREATE POLICY "product_packaging_select_authenticated" ON public.product_packaging FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "product_packaging_write_authenticated" ON public.product_packaging;
CREATE POLICY "product_packaging_write_authenticated" ON public.product_packaging FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
