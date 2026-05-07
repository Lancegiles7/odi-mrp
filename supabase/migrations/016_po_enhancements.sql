-- ============================================================
-- Odi MRP — PO enhancements
-- Migration: 016_po_enhancements.sql
--
-- 1. ingredients: supplier_sku_code, supplier_pack_size, supplier_pack_unit
--    (supplier_price already lives on ingredients.price)
-- 2. delivery_addresses: new table, with country (NZ/AU) + per-country default
-- 3. purchase_orders: delivery_address_id FK, delivery_notes (separate from
--    internal notes — surfaced on the PDF)
-- ============================================================

BEGIN;

-- 1. INGREDIENTS — supplier reference data captured on first PO
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS supplier_sku_code  text,
  ADD COLUMN IF NOT EXISTS supplier_pack_size numeric(12, 4),
  ADD COLUMN IF NOT EXISTS supplier_pack_unit text;

COMMENT ON COLUMN public.ingredients.supplier_sku_code  IS 'The supplier''s own SKU/code for this ingredient. Captured on first PO; pre-fills future POs.';
COMMENT ON COLUMN public.ingredients.supplier_pack_size IS 'Pack/order size from supplier (e.g. 25 for 25 kg bags). Used to soft-warn on PO quantity entry.';
COMMENT ON COLUMN public.ingredients.supplier_pack_unit IS 'Pack unit of measure (e.g. kg, each).';


-- 2. DELIVERY_ADDRESSES — saved delivery destinations
CREATE TABLE IF NOT EXISTS public.delivery_addresses (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text        NOT NULL,
  street        text        NOT NULL,
  contact_name  text,
  phone         text,
  country       text        NOT NULL CHECK (country IN ('NZ', 'AU')),
  is_default    boolean     NOT NULL DEFAULT false,
  is_active     boolean     NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        REFERENCES public.user_profiles(id)
);

-- At most one default per country
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_addresses_default_per_country
  ON public.delivery_addresses (country) WHERE is_default = true;

CREATE TRIGGER trg_delivery_addresses_updated_at
  BEFORE UPDATE ON public.delivery_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.delivery_addresses IS 'Saved delivery destinations for POs. Selected via dropdown when creating a PO.';

-- Seed: a default Main Warehouse NZ address based on the existing Main Warehouse location.
-- Caller can edit this immediately afterwards if the placeholder isn't right.
INSERT INTO public.delivery_addresses (label, street, contact_name, phone, country, is_default)
SELECT 'Main Warehouse',
       'Set address in Delivery Addresses settings',
       'Atma Okan',
       '+64 27 275 4329',
       'NZ',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_addresses);


-- 3. PURCHASE_ORDERS — delivery address + delivery notes
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_address_id uuid REFERENCES public.delivery_addresses(id),
  ADD COLUMN IF NOT EXISTS delivery_notes      text;

COMMENT ON COLUMN public.purchase_orders.delivery_address_id IS 'Where this PO is to be delivered. References the saved address list.';
COMMENT ON COLUMN public.purchase_orders.delivery_notes      IS 'Per-PO delivery notes (one-off, does not edit the saved address). Shown on the PDF.';


-- 4. RLS for delivery_addresses
ALTER TABLE public.delivery_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_addresses_select_authenticated" ON public.delivery_addresses;
CREATE POLICY "delivery_addresses_select_authenticated"
  ON public.delivery_addresses FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "delivery_addresses_write_authenticated" ON public.delivery_addresses;
CREATE POLICY "delivery_addresses_write_authenticated"
  ON public.delivery_addresses FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

COMMIT;
