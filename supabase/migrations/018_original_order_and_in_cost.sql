-- ============================================================
-- 018 — Original Order baseline + product_packaging.include_in_cost
--
-- 1. Original Order baseline columns on packaging, ingredients, products.
--    Captures the first PO at launch (qty + date + notes) and the current
--    on-hand SOH (qty + as-of date), so consumption since launch is
--    derivable as (original_order_qty − current_soh). Display only — does
--    NOT write into the stock_movements ledger to avoid double-counting
--    with operational PO receipts.
--
-- 2. include_in_cost flag on product_packaging links — lets a packaging
--    item be linked to a product (so demand flows through) without
--    contributing to the per-unit BOM cost. Defaults to true.
-- ============================================================

BEGIN;

-- 1. Original Order baseline + current SOH snapshot
ALTER TABLE public.packaging
  ADD COLUMN IF NOT EXISTS original_order_qty    numeric(14, 4),
  ADD COLUMN IF NOT EXISTS original_order_date   date,
  ADD COLUMN IF NOT EXISTS original_order_notes  text,
  ADD COLUMN IF NOT EXISTS current_soh           numeric(14, 4),
  ADD COLUMN IF NOT EXISTS current_soh_as_of     date;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS original_order_qty    numeric(14, 4),
  ADD COLUMN IF NOT EXISTS original_order_date   date,
  ADD COLUMN IF NOT EXISTS original_order_notes  text,
  ADD COLUMN IF NOT EXISTS current_soh           numeric(14, 4),
  ADD COLUMN IF NOT EXISTS current_soh_as_of     date;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS original_order_qty    numeric(14, 4),
  ADD COLUMN IF NOT EXISTS original_order_date   date,
  ADD COLUMN IF NOT EXISTS original_order_notes  text,
  ADD COLUMN IF NOT EXISTS current_soh           numeric(14, 4),
  ADD COLUMN IF NOT EXISTS current_soh_as_of     date;

-- 2. Per-link include-in-cost toggle on product_packaging
ALTER TABLE public.product_packaging
  ADD COLUMN IF NOT EXISTS include_in_cost boolean NOT NULL DEFAULT true;

COMMIT;
