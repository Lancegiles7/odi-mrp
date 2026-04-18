-- ============================================================
-- Odi MRP — Initial Schema
-- Migration: 001_initial_schema.sql
--
-- Run this in your Supabase SQL editor or via Supabase CLI.
-- Tables are created in dependency order.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- HELPER: updated_at trigger function
-- Applied to any table that has an updated_at column.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- ROLES
-- Coarse-grained roles. Permissions enforced via RLS and
-- application layer. Designed to be extended without migration.
-- ============================================================
CREATE TABLE public.roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.roles IS 'Coarse-grained user roles for the MRP system.';


-- ============================================================
-- LOCATIONS
-- Multi-location ready. MVP ships with a single default location.
-- Add location_id to queries once multi-warehouse is needed —
-- no schema migration required.
-- ============================================================
CREATE TABLE public.locations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.locations IS 'Warehouse / storage locations. MVP uses a single default location.';


-- ============================================================
-- USER PROFILES
-- Extends Supabase auth.users. One row per authenticated user.
-- Deleted automatically when the auth user is deleted.
-- ============================================================
CREATE TABLE public.user_profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text        NOT NULL,
  role_id     uuid        NOT NULL REFERENCES public.roles(id),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.user_profiles IS 'Extended user data linked to Supabase auth.users.';


-- ============================================================
-- PRODUCTS
-- Finished goods / SKUs that Odi manufactures.
-- Each product can have one active BOM.
-- ============================================================
CREATE TABLE public.products (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             text        NOT NULL UNIQUE,
  name            text        NOT NULL,
  description     text,
  unit_of_measure text        NOT NULL,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES public.user_profiles(id)
);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.products IS 'Finished goods / SKUs manufactured by Odi.';


-- ============================================================
-- INGREDIENTS
-- Raw materials and inputs used in production.
-- Inventory is tracked per ingredient.
-- ============================================================
CREATE TABLE public.ingredients (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text           NOT NULL UNIQUE,
  name            text           NOT NULL,
  description     text,
  unit_of_measure text           NOT NULL,
  cost_per_unit   numeric(12, 4),           -- informational: latest known unit cost
  reorder_point   numeric(12, 4),           -- threshold for low-stock alerts
  is_active       boolean        NOT NULL DEFAULT true,
  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now(),
  created_by      uuid           REFERENCES public.user_profiles(id)
);

CREATE TRIGGER trg_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ingredients IS 'Raw materials and inputs used in production.';
COMMENT ON COLUMN public.ingredients.cost_per_unit IS 'Informational only. Accurate costing uses unit_cost on stock_movements.';
COMMENT ON COLUMN public.ingredients.reorder_point IS 'Stock level at which a low-stock alert should be triggered.';


-- ============================================================
-- BILLS OF MATERIALS (BOMs)
-- One active BOM per product at a time. Previous versions are
-- retained for history. Production runs (Phase 4) will reference
-- a specific BOM version at the time the run is created.
-- ============================================================
CREATE TABLE public.boms (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid        NOT NULL REFERENCES public.products(id),
  version     integer     NOT NULL DEFAULT 1,
  is_active   boolean     NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.user_profiles(id),

  UNIQUE (product_id, version)
);

CREATE TRIGGER trg_boms_updated_at
  BEFORE UPDATE ON public.boms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.boms IS 'Bill of materials. One active version per product. Previous versions are preserved.';


-- ============================================================
-- BOM ITEMS
-- One row per ingredient within a BOM.
-- UoM can differ from the ingredient base UoM (e.g. g vs kg).
-- Unit conversion will be handled in application logic (Phase 4).
-- ============================================================
CREATE TABLE public.bom_items (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id          uuid           NOT NULL REFERENCES public.boms(id) ON DELETE CASCADE,
  ingredient_id   uuid           NOT NULL REFERENCES public.ingredients(id),
  quantity        numeric(12, 4) NOT NULL,
  unit_of_measure text           NOT NULL,
  notes           text,
  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now(),

  UNIQUE (bom_id, ingredient_id)
);

CREATE TRIGGER trg_bom_items_updated_at
  BEFORE UPDATE ON public.bom_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.bom_items IS 'Ingredient lines within a bill of materials.';
COMMENT ON COLUMN public.bom_items.unit_of_measure IS 'May differ from the ingredient base UoM. Conversion handled in application logic.';


-- ============================================================
-- SUPPLIERS
-- Companies from which Odi purchases ingredients.
-- ============================================================
CREATE TABLE public.suppliers (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  notes         text,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        REFERENCES public.user_profiles(id)
);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.suppliers IS 'Companies from which Odi purchases raw materials.';


-- ============================================================
-- PURCHASE ORDERS
-- A PO is raised against a supplier. Status is managed
-- automatically via trigger as lines are received.
--
-- Status lifecycle:
--   draft → submitted → partially_received → received
--   Any status → cancelled
-- ============================================================
CREATE TABLE public.purchase_orders (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number               text        NOT NULL UNIQUE,
  supplier_id             uuid        NOT NULL REFERENCES public.suppliers(id),
  status                  text        NOT NULL DEFAULT 'draft',
  order_date              date        NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date  date,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid        REFERENCES public.user_profiles(id),

  CONSTRAINT chk_po_status CHECK (
    status IN ('draft', 'submitted', 'partially_received', 'received', 'cancelled')
  )
);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.purchase_orders IS 'Purchase orders raised against suppliers.';
COMMENT ON COLUMN public.purchase_orders.status IS 'draft | submitted | partially_received | received | cancelled';


-- ============================================================
-- PURCHASE ORDER LINES
-- One row per ingredient ordered. quantity_received accumulates
-- across multiple delivery events. Each receipt event also
-- creates a stock_movement row.
-- ============================================================
CREATE TABLE public.purchase_order_lines (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   uuid           NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ingredient_id       uuid           NOT NULL REFERENCES public.ingredients(id),
  quantity_ordered    numeric(12, 4) NOT NULL,
  quantity_received   numeric(12, 4) NOT NULL DEFAULT 0,
  unit_cost           numeric(12, 4),
  unit_of_measure     text           NOT NULL,
  notes               text,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT chk_quantity_ordered_positive CHECK (quantity_ordered > 0),
  CONSTRAINT chk_quantity_received_non_negative CHECK (quantity_received >= 0)
);

CREATE TRIGGER trg_purchase_order_lines_updated_at
  BEFORE UPDATE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.purchase_order_lines IS 'Individual ingredient lines within a purchase order.';


-- ============================================================
-- INVENTORY BALANCES
-- Read-optimised cache of current stock per ingredient per
-- location. Maintained atomically by the stock movement trigger.
--
-- IMPORTANT: Never write to this table directly from application
-- code. All changes must flow through stock_movements.
-- ============================================================
CREATE TABLE public.inventory_balances (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id    uuid           NOT NULL REFERENCES public.ingredients(id),
  location_id      uuid           NOT NULL REFERENCES public.locations(id),
  quantity_on_hand numeric(12, 4) NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  updated_at       timestamptz    NOT NULL DEFAULT now(),

  UNIQUE (ingredient_id, location_id)
);

COMMENT ON TABLE public.inventory_balances IS 'Current stock on hand per ingredient per location. Maintained by trigger — do not write directly.';


-- ============================================================
-- STOCK MOVEMENTS — THE LEDGER
-- Append-only audit log of all inventory changes.
-- This is the source of truth. inventory_balances is derived
-- from this table and can always be recomputed from it.
--
-- quantity is signed:
--   positive = stock coming IN  (received, adjustment up)
--   negative = stock going OUT  (consumed, wastage, adjustment down)
--
-- Movement types:
--   purchase_received    — goods received against a PO line
--   production_consumed  — ingredient consumed in a production run (Phase 4)
--   opening_balance      — initial stock count on system setup
--   adjustment           — stock take correction (positive or negative)
--   wastage              — stock written off as waste
--   correction           — manual correction with explanation
--   transfer_in          — stock moved in from another location
--   transfer_out         — stock moved out to another location
-- ============================================================
CREATE TABLE public.stock_movements (
  id                      uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id           uuid           NOT NULL REFERENCES public.ingredients(id),
  location_id             uuid           NOT NULL REFERENCES public.locations(id),
  movement_type           text           NOT NULL,
  quantity                numeric(12, 4) NOT NULL,
  unit_of_measure         text           NOT NULL,
  reference_type          text,          -- 'purchase_order' | 'production_run' | 'manual' | 'transfer'
  purchase_order_line_id  uuid           REFERENCES public.purchase_order_lines(id),
  -- production_run_id will be added in Phase 4 migration
  unit_cost               numeric(12, 4),
  notes                   text           NOT NULL DEFAULT '',
  created_at              timestamptz    NOT NULL DEFAULT now(),
  created_by              uuid           REFERENCES public.user_profiles(id),

  CONSTRAINT chk_movement_type CHECK (
    movement_type IN (
      'purchase_received',
      'production_consumed',
      'opening_balance',
      'adjustment',
      'wastage',
      'correction',
      'transfer_in',
      'transfer_out'
    )
  ),
  CONSTRAINT chk_reference_type CHECK (
    reference_type IS NULL OR
    reference_type IN ('purchase_order', 'production_run', 'manual', 'transfer')
  )
);

COMMENT ON TABLE public.stock_movements IS 'Append-only inventory ledger. Source of truth for all stock changes.';
COMMENT ON COLUMN public.stock_movements.quantity IS 'Positive = stock in. Negative = stock out.';
COMMENT ON COLUMN public.stock_movements.unit_cost IS 'Unit cost at time of movement, used for stock valuation.';


-- ============================================================
-- TRIGGER: Update inventory_balances on each stock_movement INSERT
-- Upserts the balance row, incrementing quantity_on_hand by the
-- movement quantity (which may be negative for stock-out events).
-- This runs in the same transaction as the movement insert.
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.inventory_balances (
    ingredient_id,
    location_id,
    quantity_on_hand,
    last_movement_at,
    updated_at
  )
  VALUES (
    NEW.ingredient_id,
    NEW.location_id,
    NEW.quantity,
    NEW.created_at,
    now()
  )
  ON CONFLICT (ingredient_id, location_id)
  DO UPDATE SET
    quantity_on_hand = public.inventory_balances.quantity_on_hand + NEW.quantity,
    last_movement_at = NEW.created_at,
    updated_at       = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_stock_movement
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();


-- ============================================================
-- TRIGGER: Auto-update purchase order status when a line's
-- quantity_received changes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_purchase_order_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total             integer;
  v_fully_received    integer;
  v_any_received      integer;
BEGIN
  SELECT
    COUNT(*)                                                        INTO v_total
  FROM public.purchase_order_lines
  WHERE purchase_order_id = NEW.purchase_order_id;

  SELECT
    COUNT(*)                                                        INTO v_fully_received
  FROM public.purchase_order_lines
  WHERE purchase_order_id = NEW.purchase_order_id
    AND quantity_received >= quantity_ordered;

  SELECT
    COUNT(*)                                                        INTO v_any_received
  FROM public.purchase_order_lines
  WHERE purchase_order_id = NEW.purchase_order_id
    AND quantity_received > 0;

  UPDATE public.purchase_orders
  SET
    status     = CASE
                   WHEN v_fully_received = v_total THEN 'received'
                   WHEN v_any_received   > 0       THEN 'partially_received'
                   ELSE status  -- no change if nothing received yet
                 END,
    updated_at = now()
  WHERE id     = NEW.purchase_order_id
    AND status NOT IN ('cancelled');  -- never auto-update a cancelled PO

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_purchase_order_status
  AFTER UPDATE OF quantity_received ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_order_status();


-- ============================================================
-- INDEXES
-- Chosen for the most common query patterns in the MVP.
-- ============================================================
CREATE INDEX idx_stock_movements_ingredient_id    ON public.stock_movements(ingredient_id);
CREATE INDEX idx_stock_movements_location_id      ON public.stock_movements(location_id);
CREATE INDEX idx_stock_movements_movement_type    ON public.stock_movements(movement_type);
CREATE INDEX idx_stock_movements_created_at       ON public.stock_movements(created_at DESC);
CREATE INDEX idx_stock_movements_po_line_id       ON public.stock_movements(purchase_order_line_id)
  WHERE purchase_order_line_id IS NOT NULL;

CREATE INDEX idx_inventory_balances_ingredient_id ON public.inventory_balances(ingredient_id);
CREATE INDEX idx_inventory_balances_location_id   ON public.inventory_balances(location_id);

CREATE INDEX idx_purchase_orders_supplier_id      ON public.purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status           ON public.purchase_orders(status);
CREATE INDEX idx_purchase_order_lines_po_id       ON public.purchase_order_lines(purchase_order_id);
CREATE INDEX idx_purchase_order_lines_ingredient  ON public.purchase_order_lines(ingredient_id);

CREATE INDEX idx_boms_product_id                  ON public.boms(product_id);
CREATE INDEX idx_bom_items_bom_id                 ON public.bom_items(bom_id);
CREATE INDEX idx_bom_items_ingredient_id          ON public.bom_items(ingredient_id);

CREATE INDEX idx_user_profiles_role_id            ON public.user_profiles(role_id);
