-- A general external note on the PO (printed on the supplier copy), separate
-- from the internal note (which stays off the PDF) and the delivery note.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS external_notes text;

COMMENT ON COLUMN public.purchase_orders.external_notes IS 'External note shown on the PO PDF (supplier-facing). Internal note (notes) stays off the PDF.';
