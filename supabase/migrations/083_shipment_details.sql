-- ============================================================
-- Shipment details — container, freight cost, carrier, reference, booked date.
--
-- Extends the shipments table (082) with the booking details Lance tracks:
--   container_type   40ft / 20ft / LCL (part container) / air / other
--   freight_cost     the freight amount …
--   freight_currency … in NZD or AUD …
--   cost_basis       … and whether it's quoted / estimated / actual
--   carrier          freight forwarder / shipping line
--   reference        booking ref / bill of lading / container number
--   booked_date      when the booking was confirmed (vs depart = sail date)
--
-- All nullable — a shipment can be created with just a direction and filled in
-- as the booking firms up. Run in the Supabase SQL editor before deploying.
-- Idempotent.
-- ============================================================

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS container_type   text,
  ADD COLUMN IF NOT EXISTS freight_cost     numeric,
  ADD COLUMN IF NOT EXISTS freight_currency text,
  ADD COLUMN IF NOT EXISTS cost_basis       text,
  ADD COLUMN IF NOT EXISTS carrier          text,
  ADD COLUMN IF NOT EXISTS reference        text,
  ADD COLUMN IF NOT EXISTS booked_date      date;

-- Light guards (NULL always allowed).
ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_container_type_chk;
ALTER TABLE public.shipments ADD  CONSTRAINT shipments_container_type_chk
  CHECK (container_type IS NULL OR container_type IN ('40ft', '20ft', 'lcl', 'air', 'other'));

ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_cost_basis_chk;
ALTER TABLE public.shipments ADD  CONSTRAINT shipments_cost_basis_chk
  CHECK (cost_basis IS NULL OR cost_basis IN ('quoted', 'estimated', 'actual'));

ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_freight_currency_chk;
ALTER TABLE public.shipments ADD  CONSTRAINT shipments_freight_currency_chk
  CHECK (freight_currency IS NULL OR freight_currency IN ('NZD', 'AUD'));
