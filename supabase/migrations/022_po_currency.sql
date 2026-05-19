-- ============================================================
-- 022 — Add currency to purchase_orders
--
-- Lets the PO be priced in any of the supported currencies (NZD, AUD,
-- USD, EUR, GBP). Defaults to the supplier's currency when raising a
-- new PO; falls back to NZD if the supplier currency isn't set.
--
-- All existing rows backfill to 'NZD' since that's the implicit
-- assumption the system has been operating under.
-- ============================================================

BEGIN;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NZD'
    CHECK (currency IN ('NZD', 'AUD', 'USD', 'EUR', 'GBP'));

COMMENT ON COLUMN public.purchase_orders.currency IS
  'Currency the PO is priced in. Unit_cost on PO lines is interpreted as this currency.';

COMMIT;
