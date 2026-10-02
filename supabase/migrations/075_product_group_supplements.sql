-- New product group "Odi Supplements" — replaces the separate Vitamin D and
-- Her Daily Dose groups (both products now sit under it, more to follow).
-- Run in the Supabase SQL editor BEFORE deploying the code. Idempotent.

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS chk_product_type_group;

-- Legacy values stay allowed so nothing breaks mid-deploy; the app no longer offers them.
ALTER TABLE public.products
  ADD CONSTRAINT chk_product_type_group CHECK (
    product_type IS NULL OR product_type IN (
      'pouches', 'snacks_4bs', 'puffs_melts',
      'tubs', 'sachets', 'noodles', 'supplements',
      'vitamin_d', 'her_daily_dose'
    )
  );

UPDATE public.products
   SET product_type = 'supplements'
 WHERE product_type IN ('vitamin_d', 'her_daily_dose');
