-- ============================================================
-- 024 — PO Issuers (replaces hardcoded "Issued by" block on PDFs)
--
-- 1. po_issuers table with the same shape as delivery_addresses
--    (name + contact details + is_default + is_active).
-- 2. purchase_orders.issuer_id FK (nullable — legacy POs fall back to
--    the default issuer at render time).
-- 3. Seed Atma Okan as the default so existing PDFs keep working
--    end-to-end without manual setup.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.po_issuers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  title        text,
  phone        text,
  email        text,
  is_default   boolean     NOT NULL DEFAULT false,
  is_active    boolean     NOT NULL DEFAULT true,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES public.user_profiles(id)
);

CREATE TRIGGER trg_po_issuers_updated_at BEFORE UPDATE ON public.po_issuers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Only one default at a time (partial unique index — multiple non-default rows allowed).
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_issuers_only_one_default
  ON public.po_issuers ((true)) WHERE is_default = true;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS issuer_id uuid REFERENCES public.po_issuers(id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_issuer_id ON public.purchase_orders(issuer_id);

-- Seed Atma as the default (matches the values previously hardcoded in the PDF template).
INSERT INTO public.po_issuers (name, title, phone, email, is_default, is_active)
SELECT 'Atma Okan', 'Operations Manager', '+64 27 275 4329', 'orders@odinutrition.com', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.po_issuers);

-- RLS
ALTER TABLE public.po_issuers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "po_issuers_select_authenticated" ON public.po_issuers;
CREATE POLICY "po_issuers_select_authenticated" ON public.po_issuers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "po_issuers_write_authenticated"  ON public.po_issuers;
CREATE POLICY "po_issuers_write_authenticated"  ON public.po_issuers FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
