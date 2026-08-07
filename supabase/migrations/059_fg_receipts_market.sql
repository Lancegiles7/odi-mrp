-- Finished-goods receipts per country (NZ / AU) for the NZ+AUS Stock Movements
-- split. Adds a market column so a receipt lands on the correct country row.
-- Existing receipts are all NZ activity → default NZ. PO receipts inherit their
-- PO's market on insert (see purchase-orders/actions.ts receivePoLines).
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.

ALTER TABLE public.finished_goods_receipts
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'NZ';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finished_goods_receipts_market_check') THEN
    ALTER TABLE public.finished_goods_receipts
      ADD CONSTRAINT finished_goods_receipts_market_check CHECK (market IN ('NZ','AU'));
  END IF;
END $$;

COMMENT ON COLUMN public.finished_goods_receipts.market IS 'Country the receipt belongs to (NZ / AU) — drives the NZ/AUS Stock Movements rows.';
