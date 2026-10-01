-- ============================================================
-- Ingredient minimum order quantity (MOQ).
--
-- The smallest quantity the supplier will accept for an order, in the
-- ingredient's purchase unit of measure. Recorded on the ingredient; editable on
-- the ingredient form.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS moq numeric(12,4);

COMMENT ON COLUMN public.ingredients.moq IS 'Minimum order quantity the supplier accepts, in the ingredient''s purchase UoM.';
