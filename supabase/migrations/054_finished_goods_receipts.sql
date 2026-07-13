-- ============================================================
-- Odi MRP — Finished-goods inbound receipts (Stock Movements)
-- Migration: 054_finished_goods_receipts.sql
--
-- One row per finished-goods arrival. Feeds the Inbound column of the
-- Stock Movements ledger. Sources: the Inwards Finished Goods upload
-- ('inwards_upload') now, PO/goods receipts ('po_receipt') later.
-- The ledger sums units by product_id × received_month.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.finished_goods_receipts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  received_month date NOT NULL,
  received_date  date,
  units          numeric(14,4) NOT NULL DEFAULT 0,
  source         text NOT NULL DEFAULT 'inwards_upload'
                 CHECK (source IN ('inwards_upload','po_receipt','manual')),
  batch_ref      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.user_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_fg_receipts_product_month ON public.finished_goods_receipts(product_id, received_month);
CREATE TRIGGER trg_fg_receipts_updated_at BEFORE UPDATE ON public.finished_goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.finished_goods_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fg_receipts_select_authenticated" ON public.finished_goods_receipts;
CREATE POLICY "fg_receipts_select_authenticated" ON public.finished_goods_receipts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "fg_receipts_write_authenticated" ON public.finished_goods_receipts;
CREATE POLICY "fg_receipts_write_authenticated" ON public.finished_goods_receipts FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
