-- ============================================================
-- Odi MRP — Receipt lot / expiry / COA capture
-- Migration: 053_receipt_lot_expiry_coa.sql
--
-- Splits the single free-text receipt "note" into structured fields and
-- lets a Certificate of Analysis (COA) be attached at receipt time.
--
-- 1. stock_movements gains:
--      lot_number    — supplier lot / batch number
--      expiry_date   — best-before / use-by for the received stock
--      coa_file_path — Storage object path of the attached COA (nullable)
--      coa_file_name — original filename for display / download
--    The existing `notes` column stays for free-text (QA, backorder, etc).
--
-- 2. A private Storage bucket `receipt-docs` holds the COA files, with RLS
--    mirroring the existing ingredient-docs bucket (read: any authenticated
--    user; write/delete: admin / operations / supply_chain).
--
-- Existing receipts are untouched — their old combined lot/expiry text
-- remains in `notes`.
-- ============================================================

BEGIN;

-- ── 1. STOCK MOVEMENT COLUMNS ─────────────────────────────────
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS lot_number    text,
  ADD COLUMN IF NOT EXISTS expiry_date   date,
  ADD COLUMN IF NOT EXISTS coa_file_path text,
  ADD COLUMN IF NOT EXISTS coa_file_name text;

COMMENT ON COLUMN public.stock_movements.lot_number    IS 'Supplier lot / batch number captured at receipt.';
COMMENT ON COLUMN public.stock_movements.expiry_date   IS 'Best-before / use-by date for the received stock.';
COMMENT ON COLUMN public.stock_movements.coa_file_path IS 'Object path inside the receipt-docs bucket for the attached COA (NULL if none).';
COMMENT ON COLUMN public.stock_movements.coa_file_name IS 'Original COA filename for display / download.';

-- Index lots arriving close to expiry for future "expiring soon" reporting.
CREATE INDEX IF NOT EXISTS idx_stock_movements_expiry_date
  ON public.stock_movements(expiry_date) WHERE expiry_date IS NOT NULL;

-- ── 2. STORAGE BUCKET FOR COA FILES ───────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipt-docs', 'receipt-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Read: any authenticated user. Write/delete: editors only — same roles
-- as ingredient-docs so whoever can attach ingredient documents can attach COAs.
DROP POLICY IF EXISTS "receipt_docs_read" ON storage.objects;
CREATE POLICY "receipt_docs_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'receipt-docs');

DROP POLICY IF EXISTS "receipt_docs_write" ON storage.objects;
CREATE POLICY "receipt_docs_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipt-docs'
    AND public.current_user_role() IN ('admin', 'operations', 'supply_chain')
  );

DROP POLICY IF EXISTS "receipt_docs_delete" ON storage.objects;
CREATE POLICY "receipt_docs_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipt-docs'
    AND public.current_user_role() IN ('admin', 'operations', 'supply_chain')
  );

COMMIT;
