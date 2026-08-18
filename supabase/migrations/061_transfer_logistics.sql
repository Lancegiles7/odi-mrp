-- Transfer logistics fields: pick-up date + transport provider.
-- Expected delivery reuses the existing purchase_orders.expected_delivery_date.
-- Run in the Supabase SQL editor before deploying the code. Idempotent.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS pickup_date date,
  ADD COLUMN IF NOT EXISTS transport_provider text;

COMMENT ON COLUMN public.purchase_orders.pickup_date IS 'Transfer pick-up date (goods collected from the origin site).';
COMMENT ON COLUMN public.purchase_orders.transport_provider IS 'Transfer transport provider — free text (courier / carrier name).';
