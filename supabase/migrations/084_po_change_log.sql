-- ============================================================
-- PO / transfer change log — an audit trail of amendments.
--
-- Every edit to a purchase order or transfer (via updatePurchaseOrder),
-- status change (setPoStatus), creation and deletion writes one row per
-- changed field: who changed it, when, and the old → new value. Shown as a
-- "Change history" timeline on the PO detail page.
--
-- purchase_order_id is ON DELETE SET NULL so a 'deleted' entry survives the
-- PO it describes (po_number keeps it identifiable). Logging is best-effort:
-- a failure to write the log never blocks the underlying edit.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.po_change_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  po_number         text,
  action            text NOT NULL CHECK (action IN ('created', 'amended', 'status', 'deleted')),
  field             text,          -- human label, e.g. 'Quantity · Odi Noodles Chicken'
  old_value         text,
  new_value         text,
  changed_by        uuid REFERENCES public.user_profiles(id),
  changed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS po_change_log_po_idx
  ON public.po_change_log (purchase_order_id, changed_at DESC);

ALTER TABLE public.po_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_change_log_rw ON public.po_change_log;
CREATE POLICY po_change_log_rw ON public.po_change_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
