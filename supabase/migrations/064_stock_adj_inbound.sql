-- Manual inbound (received without a PO) for the ingredient/packaging Stock
-- Movements ledger. Adds to any open-PO arrivals in the same month/country.
-- Run in the Supabase SQL editor before deploying the code. Idempotent.

ALTER TABLE public.stock_period_adjustments
  ADD COLUMN IF NOT EXISTS inbound_units   numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inbound_comment text;

COMMENT ON COLUMN public.stock_period_adjustments.inbound_units IS 'Manually-entered received stock (no PO) — added to open-PO arrivals for the month/country.';
