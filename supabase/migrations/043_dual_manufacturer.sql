-- Dual-manufacturer support (Phase 1) — VMC (Australia) + Brand Nation (NZ).
--
-- Some products are made by two manufacturers: Brand Nation makes the NZ
-- volume, VMC makes the Australian volume (Tubs & Sachets to start). Same
-- recipe, but the AU build has its own toll (VMC, in AUD) and can have its
-- own ingredient landed costs (different supplier, or NZ stock freighted to
-- Australia). We model "one recipe, two cost builds".
--
-- A product is treated as dual-made when `manufacturer_au` is set. When it's
-- blank the AU cost is just the NZ cost converted at FX — exactly today's
-- behaviour — so nothing changes for single-manufacturer products.

-- 1) Manufacturer per market. The existing `manufacturer` column stays as the
--    NZ / default manufacturer; `manufacturer_au` names the AU maker (VMC).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS manufacturer_au text,
  ADD COLUMN IF NOT EXISTS toll_au numeric(12, 4);

COMMENT ON COLUMN public.products.manufacturer    IS 'NZ / default manufacturer (e.g. Brand Nation). See manufacturer_au for the Australian maker.';
COMMENT ON COLUMN public.products.manufacturer_au IS 'Australian manufacturer (e.g. VMC). When set, the product is dual-made: the AU cost build uses toll_au + per-ingredient AU costs instead of converting the NZ build.';
COMMENT ON COLUMN public.products.toll_au          IS 'Toll/manufacturing cost per unit for the AU maker (AUD). Used only when manufacturer_au is set; auto-fills from the NZ toll value in the UI.';

-- 2) Per-ingredient Australian landed cost (AUD). Optional. When set, the AU
--    build of a dual-made product uses this instead of the NZ cost ÷ FX. Blank
--    = fall back to the converted NZ cost, so only ingredients that genuinely
--    differ in Australia need a value.
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS total_loaded_cost_au numeric(12, 4);

COMMENT ON COLUMN public.ingredients.total_loaded_cost_au IS 'Australian landed cost per unit (AUD) — different AU supplier, or NZ cost plus freight to Australia. Used by dual-made products only; blank falls back to NZ loaded cost converted at FX.';
