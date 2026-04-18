-- ============================================================
-- Odi MRP — Seed Data
-- Migration: 003_seed_data.sql
--
-- Seeds the roles and default location required for the system
-- to function. Run after 001 and 002.
-- ============================================================


-- ============================================================
-- ROLES
-- ============================================================
INSERT INTO public.roles (name, description) VALUES
  ('admin',        'Full system access including user management and configuration'),
  ('operations',   'Manage products, BOMs, production, and inventory'),
  ('supply_chain', 'Manage suppliers, purchase orders, and ingredient inventory'),
  ('finance',      'View all data and manage purchase orders'),
  ('read_only',    'Read-only access to all data — no write permissions')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- DEFAULT LOCATION
-- MVP operates from a single warehouse. Additional locations
-- can be inserted here or via the admin UI when needed.
-- ============================================================
INSERT INTO public.locations (code, name, description) VALUES
  ('MAIN', 'Main Warehouse', 'Default warehouse location for all stock movements')
ON CONFLICT (code) DO NOTHING;
