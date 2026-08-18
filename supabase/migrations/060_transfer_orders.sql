-- ============================================================
-- Transfer orders — a new PO type that moves finished stock between
-- sites (manufacturer ↔ DC), rather than ordering production.
--
--   • purchase_orders.po_type            'purchase' (default) | 'transfer'
--   • purchase_orders.destination_supplier_id   the "To" site (transfers only)
--   • suppliers.site_type                'manufacturer' | 'dc' — marks which
--                                         suppliers are transfer sites (the
--                                         From/To pickers list only these)
--
-- Logistics document only for now — no Stock Movements integration yet.
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

-- 1) PO type + destination site --------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS po_type text NOT NULL DEFAULT 'purchase',
  ADD COLUMN IF NOT EXISTS destination_supplier_id uuid REFERENCES public.suppliers(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_po_type_check') THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_po_type_check CHECK (po_type IN ('purchase','transfer'));
  END IF;
END $$;

COMMENT ON COLUMN public.purchase_orders.po_type IS 'purchase = order from a supplier; transfer = move finished stock between two sites.';
COMMENT ON COLUMN public.purchase_orders.destination_supplier_id IS 'Transfer destination ("To" site). supplier_id holds the origin ("From" site). NULL for purchase orders.';

-- 2) Which suppliers are transfer sites ------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS site_type text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_site_type_check') THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_site_type_check CHECK (site_type IS NULL OR site_type IN ('manufacturer','dc'));
  END IF;
END $$;

COMMENT ON COLUMN public.suppliers.site_type IS 'Marks a supplier as a transfer site: manufacturer or dc (distribution centre). NULL = ordinary supplier (not offered as a transfer origin/destination).';

-- 3) Tag the known manufacturers (products.manufacturer values that have a
--    supplier record). Tag more later via the supplier form's "Transfer site".
UPDATE public.suppliers SET site_type = 'manufacturer'
 WHERE code IN ('SUP-BRANDNATION','SUP-VMC','SUP-IEF','SUP-FLAVOURMAKERS')
   AND site_type IS DISTINCT FROM 'manufacturer';

-- 4) Future Fulfilment distribution centre ----------------------------------
INSERT INTO public.suppliers (code, name, address, site_type, is_active)
VALUES ('SUP-FUTURE-FULFILMENT', 'Future Fulfilment', '420 Punt Road, South Yarra 3141 VIC, Australia', 'dc', true)
ON CONFLICT (code) DO UPDATE
  SET site_type = 'dc',
      address   = COALESCE(NULLIF(public.suppliers.address, ''), EXCLUDED.address);
