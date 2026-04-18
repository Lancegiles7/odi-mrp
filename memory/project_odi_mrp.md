---
name: Odi MRP project context
description: Internal MRP web app replacing Google Sheets — tech stack, phase plan, and key decisions
type: project
---

Building an internal MRP system for Odi, a food manufacturing / CPG company. Replacing a Google Sheets-based process.

**Why:** Needs a single source of truth with proper data integrity, audit trail, and role-based access for the operations team.

**Stack:** Next.js 14, TypeScript, Supabase (PostgreSQL + Auth + RLS), Tailwind CSS, shadcn/ui.

**Phase plan:**
- Phase 1 (done): Project scaffold, auth, DB schema, app shell
- Phase 2: Products, Ingredients, BOM management
- Phase 3: Suppliers, Purchase Orders
- Phase 4: Inventory and Stock Movement logic
- Phase 5: Basic internal dashboard

**Key schema decisions:**
- `stock_movements` is append-only ledger (source of truth for inventory)
- `inventory_balances` is a trigger-maintained cache (do not write directly from app code)
- `locations` table seeded with single `MAIN` warehouse — multi-location ready
- BOM versioning: one active BOM per product, old versions preserved
- Roles: admin, operations, supply_chain, finance, read_only

**How to apply:** When continuing work, start from the current phase in the plan. Do not rebuild what is already scaffolded.
