-- ============================================================
-- Shipments — one booked freight movement (e.g. the December boat
-- Australia → New Zealand) that transfer orders get loaded onto.
--
-- A shipment OWNS the depart / arrive dates. A transfer assigned to a
-- shipment inherits them (pickup_date = depart, expected_delivery_date =
-- arrive), so changing the shipment's dates moves everything on it — and
-- the arrive date is when that stock lands in Stock Movements.
--
-- Assignment is OPTIONAL: purchase_orders.shipment_id is nullable, so a
-- transfer can flow on its own with no shipment. Only transfers use it.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shipments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_number text NOT NULL UNIQUE,                 -- e.g. SHP-001
  direction       text NOT NULL CHECK (direction IN ('AU_TO_NZ', 'NZ_TO_AU')),
  depart_date     date,
  arrive_date     date,
  status          text NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned', 'departed', 'arrived', 'cancelled')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.user_profiles(id)
);

-- Optional link from a transfer order to the shipment it's loaded on.
-- ON DELETE SET NULL: deleting a shipment un-loads its transfers, never
-- deletes the transfers themselves.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS shipment_id uuid REFERENCES public.shipments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchase_orders_shipment_idx
  ON public.purchase_orders (shipment_id);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipments_rw ON public.shipments;
CREATE POLICY shipments_rw ON public.shipments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
