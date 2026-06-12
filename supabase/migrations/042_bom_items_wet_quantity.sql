-- Per-line wet weight on BOM items (freeze-dried products).
--
-- Replaces the product-level wet_weight_g/yield (which scaled every ingredient
-- uniformly) with a per-ingredient wet weight. quantity_g stays the DRY amount
-- (the pack composition); wet_quantity_g is the wet INPUT used for procurement
-- and costing. NULL = same as quantity_g (dry powders / normal ingredients).

ALTER TABLE public.bom_items
  ADD COLUMN IF NOT EXISTS wet_quantity_g numeric(12, 4);

COMMENT ON COLUMN public.bom_items.wet_quantity_g IS 'Freeze-dried: wet input grams per pack (drives cost + procurement). NULL = same as quantity_g (dry).';
COMMENT ON COLUMN public.bom_items.quantity_g IS 'Dry grams per pack (the pack composition / what is sold).';
