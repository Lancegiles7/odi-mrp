-- Transfer receipts: record the date a transfer line physically arrived at the
-- destination site. Purchase POs keep their dates on stock_movements /
-- finished_goods_receipts; transfers don't touch stock (yet), so the date lives
-- on the line itself. Read/written ONLY by transfer code paths.
-- Run in the Supabase SQL editor before deploying the code. Idempotent.

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS received_date date;

COMMENT ON COLUMN public.purchase_order_lines.received_date IS 'Transfer orders only — date the goods arrived at the destination site.';
