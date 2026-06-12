-- One-time data migration: convert snack-manufacturer ingredients to proper
-- AUD-priced ingredient records, and retire the per-BOM price overrides.
--
-- Context: snack ingredients aren't bought by Odi — they're the snack
-- manufacturer's recipe, billed in AUD. Their prices lived as per-line
-- `price_override`s on snack BOMs (with the ingredient master price empty) and
-- were never FX-converted. We move the price onto the ingredient (the DEARER
-- one where a BOM used two different prices), mark it category='snack',
-- currency='AUD', recompute the NZD loaded cost at 1.20, then clear the snack
-- overrides so each snack BOM reads straight off the ingredient.
--
-- Assumes app_settings.fx_rates.AUD = 1.20 (the agreed rate).

-- 1. Set the ingredient master from the dearest snack override.
WITH snack_ing AS (
  SELECT bi.ingredient_id AS id, MAX(bi.price_override) AS max_price
  FROM bom_items bi
  JOIN boms b     ON b.id = bi.bom_id
  JOIN products p ON p.id = b.product_id
  WHERE p.product_type = 'snacks_4bs' AND bi.price_override IS NOT NULL
  GROUP BY bi.ingredient_id
)
UPDATE public.ingredients i
SET category          = 'snack',
    currency          = 'AUD',
    price             = s.max_price,
    total_loaded_cost = ROUND(s.max_price * 1.20 + COALESCE(i.freight, 0), 4)
FROM snack_ing s
WHERE i.id = s.id;

-- 2. Clear the per-BOM overrides on snack lines — they now read the ingredient.
UPDATE public.bom_items bi
SET price_override = NULL
FROM public.boms b, public.products p
WHERE bi.bom_id = b.id AND b.product_id = p.id
  AND p.product_type = 'snacks_4bs'
  AND bi.price_override IS NOT NULL;
