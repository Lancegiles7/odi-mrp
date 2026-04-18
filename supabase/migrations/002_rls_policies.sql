-- ============================================================
-- Odi MRP — Row Level Security Policies
-- Migration: 002_rls_policies.sql
--
-- Strategy:
--   - All authenticated users can SELECT all business data
--   - Write access is gated by role
--   - stock_movements is INSERT-only (no UPDATE/DELETE except admin)
--   - user_profiles management is admin-only
--   - read_only role can SELECT only
-- ============================================================


-- ============================================================
-- HELPER: Get the current user's role name
-- Used within RLS policies. SECURITY DEFINER so the function
-- can access user_profiles even when RLS is active on that table.
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
  SELECT r.name
  FROM public.user_profiles up
  JOIN public.roles r ON r.id = up.role_id
  WHERE up.id = auth.uid()
    AND up.is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE public.roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boms                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements     ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- ROLES table — read-only for all authenticated users
-- ============================================================
CREATE POLICY "roles_select_authenticated"
  ON public.roles FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================
-- LOCATIONS — read-only for all; admin manages
-- ============================================================
CREATE POLICY "locations_select_authenticated"
  ON public.locations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "locations_write_admin"
  ON public.locations FOR ALL
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');


-- ============================================================
-- USER PROFILES — admin manages; each user can read their own
-- ============================================================
CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.current_user_role() = 'admin');

CREATE POLICY "user_profiles_write_admin"
  ON public.user_profiles FOR ALL
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');


-- ============================================================
-- PRODUCTS — all can read; operations + admin can write
-- ============================================================
CREATE POLICY "products_select_authenticated"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "products_write"
  ON public.products FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'operations'))
  WITH CHECK (public.current_user_role() IN ('admin', 'operations'));


-- ============================================================
-- INGREDIENTS — all can read; operations + supply_chain + admin can write
-- ============================================================
CREATE POLICY "ingredients_select_authenticated"
  ON public.ingredients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ingredients_write"
  ON public.ingredients FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'operations', 'supply_chain'))
  WITH CHECK (public.current_user_role() IN ('admin', 'operations', 'supply_chain'));


-- ============================================================
-- BOMs — all can read; operations + admin can write
-- ============================================================
CREATE POLICY "boms_select_authenticated"
  ON public.boms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "boms_write"
  ON public.boms FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'operations'))
  WITH CHECK (public.current_user_role() IN ('admin', 'operations'));


-- ============================================================
-- BOM ITEMS — all can read; operations + admin can write
-- ============================================================
CREATE POLICY "bom_items_select_authenticated"
  ON public.bom_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "bom_items_write"
  ON public.bom_items FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'operations'))
  WITH CHECK (public.current_user_role() IN ('admin', 'operations'));


-- ============================================================
-- SUPPLIERS — all can read; supply_chain + admin can write
-- ============================================================
CREATE POLICY "suppliers_select_authenticated"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "suppliers_write"
  ON public.suppliers FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'supply_chain'))
  WITH CHECK (public.current_user_role() IN ('admin', 'supply_chain'));


-- ============================================================
-- PURCHASE ORDERS — all can read; supply_chain + finance + admin can write
-- finance can create/update POs but not delete
-- ============================================================
CREATE POLICY "purchase_orders_select_authenticated"
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "purchase_orders_insert"
  ON public.purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'supply_chain', 'finance'));

CREATE POLICY "purchase_orders_update"
  ON public.purchase_orders FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'supply_chain', 'finance'));

CREATE POLICY "purchase_orders_delete"
  ON public.purchase_orders FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');


-- ============================================================
-- PURCHASE ORDER LINES — all can read; supply_chain + admin can write
-- ============================================================
CREATE POLICY "purchase_order_lines_select_authenticated"
  ON public.purchase_order_lines FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "purchase_order_lines_write"
  ON public.purchase_order_lines FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'supply_chain'))
  WITH CHECK (public.current_user_role() IN ('admin', 'supply_chain'));


-- ============================================================
-- INVENTORY BALANCES — read-only for all authenticated users
-- Writes happen only via the stock_movements trigger.
-- Admin can correct directly if absolutely necessary.
-- ============================================================
CREATE POLICY "inventory_balances_select_authenticated"
  ON public.inventory_balances FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "inventory_balances_write_admin"
  ON public.inventory_balances FOR ALL
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');


-- ============================================================
-- STOCK MOVEMENTS — append-only ledger
-- All authenticated non-read_only users can INSERT.
-- No one can UPDATE or DELETE except admin (break-glass only).
-- This preserves the audit trail.
-- ============================================================
CREATE POLICY "stock_movements_select_authenticated"
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "stock_movements_insert"
  ON public.stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('admin', 'operations', 'supply_chain')
  );

-- Admin-only: allows correcting erroneous movements in extreme cases
-- Application code should never call UPDATE/DELETE on this table.
CREATE POLICY "stock_movements_admin_only_mutate"
  ON public.stock_movements FOR ALL
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');
