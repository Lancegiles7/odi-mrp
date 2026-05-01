-- ============================================================
-- Odi MRP — Purchase order extensions
-- Migration: 014_purchase_orders_extended.sql
--
-- 1. suppliers: payment_terms, lead_time_days
-- 2. purchase_order_lines:
--      - ingredient_id becomes nullable
--      - new product_id (nullable FK)
--      - new description (free text for "other" lines)
--      - exactly-one CHECK across the three
--      - keep existing trigger
-- 3. app_settings: company info used on the PDF letterhead
-- ============================================================

BEGIN;

-- 1. SUPPLIERS — payment terms + lead time
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS payment_terms  text,
  ADD COLUMN IF NOT EXISTS lead_time_days integer;

COMMENT ON COLUMN public.suppliers.payment_terms  IS 'Free-text payment terms shown on POs (e.g. "Net 30").';
COMMENT ON COLUMN public.suppliers.lead_time_days IS 'Typical lead time in days from order to delivery.';


-- 2. PURCHASE_ORDER_LINES — support products + free-text "other"
ALTER TABLE public.purchase_order_lines
  ALTER COLUMN ingredient_id DROP NOT NULL;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS product_id  uuid REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS description text;

-- Exactly one of (ingredient_id, product_id, description) must be set per line
ALTER TABLE public.purchase_order_lines
  DROP CONSTRAINT IF EXISTS chk_po_line_target;

ALTER TABLE public.purchase_order_lines
  ADD CONSTRAINT chk_po_line_target CHECK (
    (CASE WHEN ingredient_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN product_id    IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN description   IS NOT NULL AND length(trim(description)) > 0 THEN 1 ELSE 0 END) = 1
  );

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_product ON public.purchase_order_lines(product_id);

COMMENT ON COLUMN public.purchase_order_lines.product_id  IS 'Set when this line is for a finished product (alternative to ingredient_id).';
COMMENT ON COLUMN public.purchase_order_lines.description IS 'Free-text line — used when neither ingredient nor product applies.';


-- 3. APP_SETTINGS — company info for PDF letterhead
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS company_legal_name text,
  ADD COLUMN IF NOT EXISTS company_nzbn       text,
  ADD COLUMN IF NOT EXISTS company_gst_number text,
  ADD COLUMN IF NOT EXISTS company_address    text,
  ADD COLUMN IF NOT EXISTS company_website    text;

COMMENT ON COLUMN public.app_settings.company_legal_name IS 'Legal entity name shown on PO PDFs (e.g. "Odi Nutrition Ltd").';
COMMENT ON COLUMN public.app_settings.company_nzbn       IS 'NZ Business Number, shown on PO PDFs.';
COMMENT ON COLUMN public.app_settings.company_gst_number IS 'GST registration number, shown on PO PDFs.';
COMMENT ON COLUMN public.app_settings.company_address    IS 'Multi-line postal address (use \n for line breaks).';
COMMENT ON COLUMN public.app_settings.company_website    IS 'Public website URL shown on PO PDFs.';

COMMIT;
