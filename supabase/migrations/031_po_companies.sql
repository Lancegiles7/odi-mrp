-- 031_po_companies.sql
--
-- Adds a per-PO "issuing company" concept — the legal entity at the top
-- of the PO PDF (the letterhead). Separate from po_issuers (the person
-- signing the PO) so the same person can issue from different companies.
--
-- Mirrors the po_issuers pattern (024_po_issuers.sql): a small reference
-- table with is_default / is_active, one default at a time, plus a FK
-- column on purchase_orders. Existing POs (no company_id) fall back to
-- the default company in the PDF render — nothing breaks.
--
-- Seeds Odi Nutrition Ltd as the default (using app_settings data) and
-- Vision Made Co Pty Ltd (the new AU entity).
--
-- Run after 030 in the Supabase SQL editor.

create table if not exists public.po_companies (
  id                     uuid        primary key default gen_random_uuid(),
  legal_name             text        not null,
  country                text,                   -- 'NZ' / 'AU' / etc, free-form so we don't need an enum
  business_number_label  text,                   -- 'NZBN' for NZ, 'ABN' for AU
  business_number        text,
  tax_number_label       text,                   -- usually 'GST'
  tax_number             text,
  address                text,
  website                text,
  email                  text,
  phone                  text,
  logo_path              text,                   -- public path under /public, e.g. '/odi-logo@2x.png' or '/vmc-logo.png'
  brand_colour           text,                   -- accent / divider colour (hex), e.g. '#5a8a3a' for Odi or '#0e3b1f' for VMC
  is_default             boolean     not null default false,
  is_active              boolean     not null default true,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid        references public.user_profiles(id)
);

create trigger trg_po_companies_updated_at before update on public.po_companies
for each row execute function public.set_updated_at();

-- Enforce only one default at a time (partial unique index — same trick as po_issuers).
create unique index if not exists idx_po_companies_only_one_default
  on public.po_companies ((true)) where is_default = true;

-- Add FK column on purchase_orders. Nullable so existing POs keep working.
alter table public.purchase_orders
  add column if not exists company_id uuid references public.po_companies(id);

create index if not exists idx_purchase_orders_company_id
  on public.purchase_orders(company_id);

-- Seed: Odi Nutrition Ltd as the default, pulling values from app_settings
-- so the new system starts with the same letterhead today.
insert into public.po_companies (
  legal_name, country, business_number_label, business_number,
  tax_number_label, tax_number, address, website, email,
  logo_path, brand_colour, is_default, is_active
)
select
  coalesce(a.company_legal_name, 'Odi Nutrition Ltd'),
  'NZ',
  'NZBN',
  a.company_nzbn,
  'GST',
  a.company_gst_number,
  a.company_address,
  coalesce(a.company_website, 'www.odinutrition.com'),
  null,
  '/odi-logo@2x.png',
  '#5a8a3a',
  true,
  true
from (select * from public.app_settings limit 1) a
where not exists (select 1 from public.po_companies where legal_name ilike 'Odi%');

-- Seed: VISION MADE CO PTY LTD (AU entity)
insert into public.po_companies (
  legal_name, country, business_number_label, business_number,
  tax_number_label, tax_number, address, website, email, phone,
  logo_path, brand_colour, is_default, is_active
)
select
  'VISION MADE CO PTY LTD', 'AU',
  'ABN', '83 647 140 798',
  'GST', null,
  '2/24 Doherty St, Brendale QLD 4500, Australia',
  'visionmadeco.com',
  null,
  '(07) 3448 6216',
  '/vmc-logo.png',
  '#0e3b1f',
  false, true
where not exists (select 1 from public.po_companies where legal_name ilike 'Vision Made%');

-- RLS — same pattern as po_issuers: any authenticated user can read/write.
alter table public.po_companies enable row level security;

drop policy if exists "po_companies_select_authenticated" on public.po_companies;
create policy "po_companies_select_authenticated" on public.po_companies
  for select to authenticated using (true);

drop policy if exists "po_companies_write_authenticated" on public.po_companies;
create policy "po_companies_write_authenticated" on public.po_companies
  for all to authenticated using (true) with check (true);

-- Helpful comment on the columns
comment on table  public.po_companies is 'Legal entities that can issue purchase orders — drives the PDF letterhead. Independent of po_issuers (the contact person).';
comment on column public.po_companies.logo_path    is 'Public asset path under /public, e.g. "/odi-logo@2x.png". When null, header renders text-only.';
comment on column public.po_companies.brand_colour is 'Accent colour hex used for the title bar / heading. Hex string with #.';
