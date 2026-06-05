-- ============================================================
-- 035 — Enhancement log (in-app feature requests)
--
-- Replaces "team emails me ideas" with an in-app log. Anyone
-- signed in can submit + comment. Status changes are admin-only.
--
-- Tables:
--   enhancements         — one row per submitted idea
--   enhancement_comments — threaded discussion under each
--
-- RLS:
--   • SELECT: any authenticated
--   • INSERT enhancement / comment: any authenticated
--   • UPDATE enhancement (status, note, etc): admin only
--   • DELETE enhancement / comment: admin only
-- ============================================================

BEGIN;

-- ── ENHANCEMENTS ──────────────────────────────────────────────
create table if not exists public.enhancements (
  id                  uuid        primary key default gen_random_uuid(),
  title               text        not null,
  description         text        not null,
  category            text        not null,
  priority            text        not null default 'medium',
  status              text        not null default 'new',
  status_note         text,
  status_changed_by   uuid        references public.user_profiles(id),
  status_changed_at   timestamptz,
  built_url           text,
  submitted_by        uuid        references public.user_profiles(id),
  submitted_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_enhancements_status       on public.enhancements(status);
create index if not exists idx_enhancements_submitted_at on public.enhancements(submitted_at desc);
create index if not exists idx_enhancements_submitted_by on public.enhancements(submitted_by);

create trigger trg_enhancements_updated_at before update on public.enhancements
  for each row execute function public.set_updated_at();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_enhancement_status') then
    alter table public.enhancements
      add constraint chk_enhancement_status
      check (status in ('new', 'under_review', 'approved', 'in_progress', 'built', 'declined', 'on_hold'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_enhancement_priority') then
    alter table public.enhancements
      add constraint chk_enhancement_priority
      check (priority in ('low', 'medium', 'high', 'urgent'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_enhancement_category') then
    alter table public.enhancements
      add constraint chk_enhancement_category
      check (category in ('demand', 'production', 'ingredients', 'packaging', 'purchase_orders', 'inventory', 'reporting', 'settings', 'other'));
  end if;
end $$;

comment on table  public.enhancements is 'Team-submitted feature/improvement requests. Status flow: new → under_review → approved → in_progress → built (or declined / on_hold).';
comment on column public.enhancements.built_url is 'When status = built, optional link to where in the app the feature lives (e.g. "/ingredients").';

-- ── COMMENTS ──────────────────────────────────────────────────
create table if not exists public.enhancement_comments (
  id              uuid        primary key default gen_random_uuid(),
  enhancement_id  uuid        not null references public.enhancements(id) on delete cascade,
  author_id       uuid        references public.user_profiles(id),
  body            text        not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_enhancement_comments_enhancement_id on public.enhancement_comments(enhancement_id);
create index if not exists idx_enhancement_comments_created_at     on public.enhancement_comments(created_at);

-- ── RLS ───────────────────────────────────────────────────────
alter table public.enhancements          enable row level security;
alter table public.enhancement_comments  enable row level security;

drop policy if exists "enhancements_select_authenticated" on public.enhancements;
create policy "enhancements_select_authenticated" on public.enhancements
  for select to authenticated using (true);

drop policy if exists "enhancements_insert_authenticated" on public.enhancements;
create policy "enhancements_insert_authenticated" on public.enhancements
  for insert to authenticated with check (true);

-- Only admins can change status, decline, etc.
drop policy if exists "enhancements_update_admin" on public.enhancements;
create policy "enhancements_update_admin" on public.enhancements
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "enhancements_delete_admin" on public.enhancements;
create policy "enhancements_delete_admin" on public.enhancements
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- Comments — anyone can post; admin can delete (moderation).
drop policy if exists "enhancement_comments_select_authenticated" on public.enhancement_comments;
create policy "enhancement_comments_select_authenticated" on public.enhancement_comments
  for select to authenticated using (true);

drop policy if exists "enhancement_comments_insert_authenticated" on public.enhancement_comments;
create policy "enhancement_comments_insert_authenticated" on public.enhancement_comments
  for insert to authenticated with check (true);

drop policy if exists "enhancement_comments_delete_admin" on public.enhancement_comments;
create policy "enhancement_comments_delete_admin" on public.enhancement_comments
  for delete to authenticated
  using (public.current_user_role() = 'admin');

COMMIT;
