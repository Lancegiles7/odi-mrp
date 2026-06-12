-- Per-line supplier code + pack size on purchase order lines.
--
-- Ingredients and packaging carry supplier reference data on their item master.
-- Product and free-text "other" lines have no master, so the supplier's code
-- (and pack size) for those lines is captured on the PO line itself. These
-- columns hold that line-level value; ingredient/packaging lines leave them
-- null and keep using their master's value.

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS supplier_code      text,
  ADD COLUMN IF NOT EXISTS supplier_pack_size numeric(12, 4);

COMMENT ON COLUMN public.purchase_order_lines.supplier_code      IS 'Supplier''s code for this line (used by product / "other" lines that have no item master). Shown on the PO PDF.';
COMMENT ON COLUMN public.purchase_order_lines.supplier_pack_size IS 'Supplier pack size for this line (product / "other" lines).';
