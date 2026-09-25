-- ============================================================
-- Transfer orders — "Moves stock between builds?"
--
--   • purchase_orders.stock_move   NULL (no) | 'NZ_TO_AU' | 'AU_TO_NZ'
--
-- A transfer marked NZ_TO_AU / AU_TO_NZ moves finished stock between the NZ
-- and AUS builds: off the sending build in the pick-up month, onto the
-- receiving build in the arrival month, on the Production schedule and Stock
-- Movements. Nothing is produced, so it never drives ingredient/packaging
-- demand or manufacturer POs.
--
-- NULL (the default, and every existing transfer) = logistics only, no stock
-- effect. Mark the transfers that really moved stock between builds in the app.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS stock_move text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_stock_move_check') THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_stock_move_check CHECK (stock_move IS NULL OR stock_move IN ('NZ_TO_AU','AU_TO_NZ'));
  END IF;
END $$;

COMMENT ON COLUMN public.purchase_orders.stock_move IS 'Transfers only: NZ_TO_AU / AU_TO_NZ moves stock between the NZ and AUS builds (Production + Stock Movements). NULL = logistics only.';
