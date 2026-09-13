-- New product group "Her Daily Dose" (Odi Post Partum sits under it).
-- Widen the product_type CHECK constraint to allow the new value.
-- Run in the Supabase SQL editor before deploying the code. Idempotent.

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS chk_product_type_group;

ALTER TABLE public.products
  ADD CONSTRAINT chk_product_type_group CHECK (
    product_type IS NULL OR product_type IN (
      'pouches', 'snacks_4bs', 'puffs_melts',
      'tubs', 'sachets', 'noodles', 'vitamin_d',
      'her_daily_dose'
    )
  );
