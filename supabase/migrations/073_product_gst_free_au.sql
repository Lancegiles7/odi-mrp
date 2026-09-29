-- ============================================================
-- GST-free in Australia (per product).
--
-- Some products are basic foods that carry NO GST in Australia (pouches,
-- sachets, and a couple of tubs). For those, nothing should be stripped from the
-- AU RRP when computing the AU margin. NZ is unchanged (15% still applies).
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gst_free_au boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.gst_free_au IS 'GST-free in Australia (basic food) — no GST stripped from the AU RRP for the AU margin calc. NZ GST still applies.';

-- All pouches + sachets are GST-free in AU.
UPDATE public.products SET gst_free_au = true WHERE product_type IN ('pouches','sachets');

-- Plus the Beef Bone Broth tub and the Baby Cereal tub.
UPDATE public.products SET gst_free_au = true WHERE sku_code IN ('FG-ODI-TUB-BBB','FG-ODI-TUB-BC');
