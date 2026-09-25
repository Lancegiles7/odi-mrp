-- ============================================================
-- Site market (NZ/AU) for transfer stock direction.
--
-- A transfer order moves finished stock between sites; to reflect it in Stock
-- Movements we need each site's market so we know which market loses the stock
-- and which gains it. Sets the known manufacturers; other sites can be tagged
-- later (a transfer whose sites lack a market simply won't post stock).
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS market text;

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_market_check;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_market_check
  CHECK (market IS NULL OR market IN ('NZ','AU'));

UPDATE public.suppliers SET market = 'NZ'
  WHERE market IS NULL AND name ILIKE 'Brand Nation%';
UPDATE public.suppliers SET market = 'AU'
  WHERE market IS NULL AND (name ILIKE 'Vision Made%' OR name ILIKE 'I Eat Fresh%');

COMMENT ON COLUMN public.suppliers.market IS 'Market this site sits in (NZ/AU) — drives which market a transfer order debits/credits in Stock Movements.';

-- Allow a 'transfer' source on finished-goods receipts (paired +/- rows a
-- transfer order posts to Stock Movements).
ALTER TABLE public.finished_goods_receipts DROP CONSTRAINT IF EXISTS finished_goods_receipts_source_check;
ALTER TABLE public.finished_goods_receipts ADD CONSTRAINT finished_goods_receipts_source_check
  CHECK (source IN ('inwards_upload','po_receipt','manual','transfer'));
