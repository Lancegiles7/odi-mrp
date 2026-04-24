-- ============================================================
-- Odi MRP — Product soft-delete (30-day trash)
-- Migration: 010_product_soft_delete.sql
--
-- Adds:
--   • products.deleted_at / deleted_by   (soft-delete markers)
--   • boms.product_id FK → ON DELETE CASCADE (so permanent-delete
--     automatically removes BOMs and their lines)
--
-- Soft-delete semantics:
--   • deleted_at = now() + is_active = false → hidden from all lists
--   • Admin's /products/trash page can restore (unset both) or
--     permanently delete (row + cascaded BOMs/bom_items)
--   • A call from the trash page purges rows where
--     deleted_at < now() - 30 days.
-- ============================================================

BEGIN;

-- 1. Soft-delete columns on products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.user_profiles(id);

COMMENT ON COLUMN public.products.deleted_at
  IS 'Set when a product is soft-deleted. Purged permanently after 30 days.';
COMMENT ON COLUMN public.products.deleted_by
  IS 'Profile of the user who deleted the product.';

CREATE INDEX IF NOT EXISTS idx_products_deleted_at
  ON public.products(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 2. Cascade boms when a product is hard-deleted.
-- (bom_items already cascade from boms per migration 001.)
ALTER TABLE public.boms
  DROP CONSTRAINT IF EXISTS boms_product_id_fkey;
ALTER TABLE public.boms
  ADD CONSTRAINT boms_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

COMMIT;
