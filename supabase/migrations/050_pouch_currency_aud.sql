-- Flavour Makers pouches are invoiced in AUD, so their ingredient prices are
-- AUD. The currency field was NZD on some of them, which made AUD purchase
-- orders convert the price (e.g. $1.18 → $0.97). Set the currency to AUD.
--
-- Leaves price and total_loaded_cost as-is — they're already AUD-consistent
-- (loaded = price × FX), so BOM costs are unchanged. Only the currency label is
-- corrected. Idempotent; skips any pouch already on AUD.

UPDATE public.ingredients
SET currency = 'AUD'
WHERE sku_code LIKE 'ING-FLAVOUR-MAKERS-%-POUCH'
  AND COALESCE(currency, 'NZD') <> 'AUD';
