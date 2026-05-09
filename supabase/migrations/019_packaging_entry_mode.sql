-- ============================================================
-- 019 — product_packaging.entry_mode + entry_value
--
-- Lets the user enter packaging quantity in the natural direction:
--
--   entry_mode = 'per_pack'  (default) — entry_value = how many of the
--     packaging are consumed per 1 product. e.g. 4 flow wraps per brownie.
--     quantity_per_unit (canonical) = entry_value.
--
--   entry_mode = 'per_group'           — entry_value = how many products
--     fit inside 1 of this packaging.   e.g. 5 brownies per SRT, 15 sachets
--     per SRT. quantity_per_unit (canonical) = 1 / entry_value.
--
-- quantity_per_unit remains the source of truth for demand and cost
-- calculations. entry_mode + entry_value preserve the user's intent so the
-- UI can show what was typed (no rounding drift on round-trip).
-- ============================================================

BEGIN;

ALTER TABLE public.product_packaging
  ADD COLUMN IF NOT EXISTS entry_mode  text NOT NULL DEFAULT 'per_pack'
    CHECK (entry_mode IN ('per_pack', 'per_group')),
  ADD COLUMN IF NOT EXISTS entry_value numeric(14, 6);

-- Backfill existing rows: treat them all as per_pack with entry_value = qty.
UPDATE public.product_packaging
SET entry_value = quantity_per_unit
WHERE entry_value IS NULL;

COMMIT;
