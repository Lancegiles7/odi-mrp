-- ============================================================
-- 067_ingredient_au_freight.sql
--
-- Give the Australian side of an ingredient the same Price + Freight +
-- Landed cost shape the NZ side already has.
--
-- Until now `total_loaded_cost_au` was a single all-in figure typed by hand,
-- with nothing on screen saying it wanted price AND freight added together —
-- so freight-only values were being entered and the ingredient price silently
-- dropped out of the Australian cost build.
--
--   price_au    — what the ingredient costs in Australia (AUD), when the AU
--                 buy genuinely differs. Blank = the NZ purchase price
--                 converted to AUD.
--   freight_au  — cost of getting it to the Australian factory (AUD).
--
-- `total_loaded_cost_au` keeps its job as the one figure every downstream
-- reader uses (costing, products, stock movements) — it just becomes derived
-- (price_au + freight_au) instead of typed, and stays overridable.
--
-- BACKWARDS COMPATIBLE: existing total_loaded_cost_au values are untouched and
-- keep acting as an override. price_au / freight_au start NULL, so no cost
-- moves on deploy. Fill the new fields in per ingredient at your own pace.
-- ============================================================

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS price_au   numeric(12, 4),
  ADD COLUMN IF NOT EXISTS freight_au numeric(12, 4);

COMMENT ON COLUMN public.ingredients.price_au   IS 'Australian purchase price per unit (AUD). Blank = use the NZ purchase price converted to AUD. Feeds total_loaded_cost_au.';
COMMENT ON COLUMN public.ingredients.freight_au IS 'Freight per unit to the Australian factory (AUD). Feeds total_loaded_cost_au.';

-- Track the two new entered prices in the price-history ledger, alongside the
-- NZ ones. Derived landed costs stay untracked, per 062's rule.
DROP TRIGGER IF EXISTS trg_price_ingredients ON public.ingredients;
CREATE TRIGGER trg_price_ingredients
  BEFORE INSERT OR UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.log_price_change(
    'ingredient', 'price', 'freight', 'price_au', 'freight_au', 'cost_per_unit', 'currency');
