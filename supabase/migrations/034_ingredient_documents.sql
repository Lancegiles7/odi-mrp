-- ============================================================
-- 034 — Ingredient documents
--
-- Per-ingredient file attachments (COAs, spec sheets, allergen
-- statements, certification certificates, etc). Files themselves
-- live in a private Supabase Storage bucket; this table holds
-- the metadata so we can list / download / delete cleanly.
--
-- Storage bucket setup is automatic via the storage.buckets insert
-- below — no dashboard click required.
--
-- RLS policy: any authenticated user can read; only users whose
-- role can edit ingredients (admin / operations / supply_chain)
-- can insert / delete. Mirrors the existing ingredient-edit perms.
-- ============================================================

BEGIN;

-- ── METADATA TABLE ────────────────────────────────────────────
create table if not exists public.ingredient_documents (
  id              uuid        primary key default gen_random_uuid(),
  ingredient_id   uuid        not null references public.ingredients(id) on delete cascade,
  file_path       text        not null,                    -- Storage object path inside the bucket
  file_name       text        not null,                    -- original filename (display only)
  doc_type        text        not null,                    -- coa | spec | allergen | nutrition | cert | pricing | other
  size_bytes      bigint,
  mime_type       text,
  notes           text,                                    -- optional free-text (e.g. "Batch 20251104")
  expires_at      date,                                    -- optional — flag red in UI once past
  uploaded_by     uuid        references public.user_profiles(id),
  uploaded_at     timestamptz not null default now()
);

create index if not exists idx_ingredient_documents_ingredient_id on public.ingredient_documents(ingredient_id);
create index if not exists idx_ingredient_documents_uploaded_at   on public.ingredient_documents(uploaded_at desc);
create index if not exists idx_ingredient_documents_expires_at    on public.ingredient_documents(expires_at) where expires_at is not null;

-- Type check.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_ingredient_doc_type'
      and conrelid = 'public.ingredient_documents'::regclass
  ) then
    alter table public.ingredient_documents
      add constraint chk_ingredient_doc_type
      check (doc_type in ('coa', 'spec', 'allergen', 'nutrition', 'cert', 'pricing', 'other'));
  end if;
end $$;

comment on table  public.ingredient_documents is 'File attachments per ingredient. Files are in Storage bucket ingredient-docs; this table holds metadata + audit trail.';
comment on column public.ingredient_documents.file_path is 'Object path inside the ingredient-docs bucket (e.g. "<ingredient_id>/<uuid>-<filename>.pdf").';
comment on column public.ingredient_documents.expires_at is 'Optional expiry — UI flags doc red when current date > expires_at. Useful for renewable certs.';

-- ── RLS ────────────────────────────────────────────────────────
alter table public.ingredient_documents enable row level security;

drop policy if exists "ingredient_documents_select_authenticated" on public.ingredient_documents;
create policy "ingredient_documents_select_authenticated"
  on public.ingredient_documents for select
  to authenticated
  using (true);

-- Insert / delete gated by role — operations / supply_chain / admin.
-- Uses the same current_user_role() helper the rest of the app uses.
drop policy if exists "ingredient_documents_insert_editors" on public.ingredient_documents;
create policy "ingredient_documents_insert_editors"
  on public.ingredient_documents for insert
  to authenticated
  with check (
    public.current_user_role() in ('admin', 'operations', 'supply_chain')
  );

drop policy if exists "ingredient_documents_delete_editors" on public.ingredient_documents;
create policy "ingredient_documents_delete_editors"
  on public.ingredient_documents for delete
  to authenticated
  using (
    public.current_user_role() in ('admin', 'operations', 'supply_chain')
  );

-- ── STORAGE BUCKET ────────────────────────────────────────────
-- Create the bucket (private — no public URL). If it already
-- exists this is a no-op.
insert into storage.buckets (id, name, public)
values ('ingredient-docs', 'ingredient-docs', false)
on conflict (id) do nothing;

-- Storage RLS — any authenticated user can read; editors can write / delete.
-- Storage policies are defined on the storage.objects table.

drop policy if exists "ingredient_docs_read" on storage.objects;
create policy "ingredient_docs_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'ingredient-docs');

drop policy if exists "ingredient_docs_write" on storage.objects;
create policy "ingredient_docs_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ingredient-docs'
    and public.current_user_role() in ('admin', 'operations', 'supply_chain')
  );

drop policy if exists "ingredient_docs_delete" on storage.objects;
create policy "ingredient_docs_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ingredient-docs'
    and public.current_user_role() in ('admin', 'operations', 'supply_chain')
  );

COMMIT;
