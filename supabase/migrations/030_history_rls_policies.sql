-- ============================================================
-- 030 — RLS policies for the audit / comment tables
--
-- Migrations 027 / 028 / 029 created the audit and comment tables
-- but didn't add RLS policies. Supabase auto-enables RLS on new
-- public-schema tables, so every insert was being rejected with
-- "new row violates row-level security policy" — and because the
-- app code was awaiting the insert without destructuring the error
-- (fixed in commit 3948889), those failures were silently swallowed
-- and users saw "saved" UI while nothing landed in the database.
--
-- Adds SELECT + INSERT policies for authenticated users. UPDATE and
-- DELETE are deliberately omitted — these tables are append-only
-- audit logs.
-- ============================================================

BEGIN;

ALTER TABLE public.product_opening_stock_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_opening_stock_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_opening_stock_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_cell_comments              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select" ON public.product_opening_stock_history;
DROP POLICY IF EXISTS "auth_insert" ON public.product_opening_stock_history;
DROP POLICY IF EXISTS "auth_select" ON public.ingredient_opening_stock_history;
DROP POLICY IF EXISTS "auth_insert" ON public.ingredient_opening_stock_history;
DROP POLICY IF EXISTS "auth_select" ON public.packaging_opening_stock_history;
DROP POLICY IF EXISTS "auth_insert" ON public.packaging_opening_stock_history;
DROP POLICY IF EXISTS "auth_select" ON public.demand_cell_comments;
DROP POLICY IF EXISTS "auth_insert" ON public.demand_cell_comments;

CREATE POLICY "auth_select" ON public.product_opening_stock_history     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.product_opening_stock_history     FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_select" ON public.ingredient_opening_stock_history  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.ingredient_opening_stock_history  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_select" ON public.packaging_opening_stock_history   FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.packaging_opening_stock_history   FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_select" ON public.demand_cell_comments              FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.demand_cell_comments              FOR INSERT TO authenticated WITH CHECK (true);

COMMIT;
