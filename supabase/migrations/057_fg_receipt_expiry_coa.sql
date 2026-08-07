-- Finished-goods receipts can carry expiry / lot / COA (like ingredient receipts).
-- Finished goods have a best-before per batch received; the receive screen was
-- entering these but had nowhere to store them for product lines. batch_ref
-- already exists (used for the lot #); add expiry + COA columns.
--
-- Run in the Supabase SQL editor. Safe with old code (unused by it) and the
-- new code's insert is non-fatal, so run order is flexible. Idempotent.

ALTER TABLE public.finished_goods_receipts
  ADD COLUMN IF NOT EXISTS expiry_date    date,
  ADD COLUMN IF NOT EXISTS coa_file_path  text,
  ADD COLUMN IF NOT EXISTS coa_file_name  text;

COMMENT ON COLUMN public.finished_goods_receipts.expiry_date IS 'Best-before / expiry of the batch received (finished goods).';
