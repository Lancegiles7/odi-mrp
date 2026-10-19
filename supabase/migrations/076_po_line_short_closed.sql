-- ============================================================
-- Short-close a purchase-order line.
--
-- When a delivery arrives short (e.g. 999 of 4,000 brownies) you can either
-- leave the shortfall "still to come" (PO stays Partial, the remainder keeps
-- showing as incoming supply) OR close the line off — "nothing more is coming".
--
-- A closed line's shortfall (ordered − received) is written off: it stops
-- counting as incoming stock in Stock Movements and Production cover, and the
-- PO completes once every line is either fully received or closed. Reopening a
-- line clears the flag and the shortfall becomes "still to come" again.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS short_closed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.purchase_order_lines.short_closed IS
  'True when the line''s shortfall (ordered − received) has been written off — no more stock is expected. Set from the Receive screen; cleared on Reopen.';
