-- Freeze-dried products: wet (input) weight.
--
-- Melts/puffs are built as a wet mix, then freeze-dried down to a much smaller
-- dry pack. The BOM is entered as the dry composition, but the cost and the
-- ingredient demand must be based on the WET input (what's actually used/bought).
--
-- `wet_weight_g` is the wet input per pack; `size_g` stays the dry pack (what's
-- sold). When wet_weight_g > size_g, costing and demand scale the BOM by
-- wet_weight_g / size_g. NULL = not freeze-dried (normal product, no scaling).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS wet_weight_g numeric(12, 4);

COMMENT ON COLUMN public.products.wet_weight_g IS 'Freeze-dried: wet input weight per pack (g). Cost & demand scale by wet_weight_g / size_g. NULL = not freeze-dried.';
