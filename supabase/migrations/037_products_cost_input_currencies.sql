-- Per-line currency for the product-level cost inputs.
--
-- Ingredients and packaging already carry their own currency (on each
-- ingredient / packaging record, converted to NZD on save). The remaining
-- product-level inputs were silently treated as NZD even though they're
-- entered in AUD (toll, margin, task) — understating cost. Freight is NZD.
--
-- We add an explicit currency per input so costing can convert correctly,
-- and seed the defaults to what they actually are today:
--   toll / margin / other (task)  → AUD
--   freight_nz / freight_au       → NZD
-- NOT NULL DEFAULT applies the seed to every existing row automatically.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS toll_currency       text NOT NULL DEFAULT 'AUD' CHECK (toll_currency       IN ('AUD','NZD')),
  ADD COLUMN IF NOT EXISTS margin_currency     text NOT NULL DEFAULT 'AUD' CHECK (margin_currency     IN ('AUD','NZD')),
  ADD COLUMN IF NOT EXISTS other_currency      text NOT NULL DEFAULT 'AUD' CHECK (other_currency      IN ('AUD','NZD')),
  ADD COLUMN IF NOT EXISTS freight_nz_currency text NOT NULL DEFAULT 'NZD' CHECK (freight_nz_currency IN ('AUD','NZD')),
  ADD COLUMN IF NOT EXISTS freight_au_currency text NOT NULL DEFAULT 'NZD' CHECK (freight_au_currency IN ('AUD','NZD'));

COMMENT ON COLUMN public.products.toll_currency       IS 'Currency the toll value is entered in (AUD|NZD). Converted in costing.';
COMMENT ON COLUMN public.products.margin_currency     IS 'Currency the margin value is entered in (AUD|NZD).';
COMMENT ON COLUMN public.products.other_currency      IS 'Currency the task/other value is entered in (AUD|NZD).';
COMMENT ON COLUMN public.products.freight_nz_currency IS 'Currency the NZ freight value is entered in (AUD|NZD).';
COMMENT ON COLUMN public.products.freight_au_currency IS 'Currency the AU freight value is entered in (AUD|NZD).';
