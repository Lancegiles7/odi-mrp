-- ============================================================
-- 062_price_history.sql
--
-- One append-only log of every price change, across:
--   ingredients · packaging · products (finished goods)
--
-- Design notes
--   • The log is written by DATABASE TRIGGERS, not by the app. Anything that
--     changes a price is captured — a screen, an import, or SQL run by hand in
--     the Supabase dashboard. App-level logging only ever catches the one
--     screen it was written into, which is why the existing ingredient history
--     has gaps.
--   • ONLY entered prices are tracked — the numbers a person types. Derived
--     landed costs (total_loaded_cost, total_loaded_cost_nzd, products.packaging)
--     are deliberately NOT tracked, so changing the FX rate re-costs everything
--     without filling the log with hundreds of rows. Confirmed with Lance.
--   • Each priced table gains a transient `price_change_reason` column. The app
--     sets it in the same UPDATE as the new price; the trigger copies it into
--     the log and blanks it again, so the reason lives only in the history.
--
-- Safety
--   • Runs in a single transaction; idempotent.
--   • Function body is single-quoted, not dollar-quoted — the Supabase SQL
--     editor mis-parses $$ blocks (see migration 006).
--   • The old ingredient_price_history table is left in place and its rows are
--     carried across; nothing is dropped.
-- ============================================================

BEGIN;

-- ── The log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.price_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text        NOT NULL,
  entity_id     uuid        NOT NULL,
  field         text        NOT NULL,
  old_value     numeric(14, 4),
  new_value     numeric(14, 4),
  old_text      text,
  new_text      text,
  currency      text,
  reason        text,
  changed_by    uuid        REFERENCES public.user_profiles(id),
  changed_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_price_history_entity CHECK (
    entity_type IN ('ingredient', 'packaging', 'product', 'bom_item', 'po_line')
  )
);

CREATE INDEX IF NOT EXISTS idx_ph_entity     ON public.price_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ph_changed_at ON public.price_history(changed_at DESC);

COMMENT ON TABLE  public.price_history       IS 'Append-only log of entered price changes. Written by trigger, never by hand.';
COMMENT ON COLUMN public.price_history.field IS 'The column that changed, e.g. price / freight / rrp / unit_cost.';
COMMENT ON COLUMN public.price_history.currency IS 'Currency the amounts are expressed in, where the row has one.';

-- ── Transient reason, carried in on the same UPDATE ─────────
ALTER TABLE public.ingredients          ADD COLUMN IF NOT EXISTS price_change_reason text;
ALTER TABLE public.packaging            ADD COLUMN IF NOT EXISTS price_change_reason text;
ALTER TABLE public.products             ADD COLUMN IF NOT EXISTS price_change_reason text;
-- bom_items and purchase_order_lines are deliberately NOT tracked. Both are
-- saved by deleting every line and re-inserting them, so a trigger there would
-- log every line on every save whether or not a price moved. The PO document
-- itself already records what was paid at the time.

COMMENT ON COLUMN public.ingredients.price_change_reason IS 'Write-only: set alongside a price change, copied to price_history and cleared by the trigger.';

-- ── One generic trigger for every priced table ──────────────
-- TG_ARGV[0] = entity_type, TG_ARGV[1..] = the columns to watch.
CREATE OR REPLACE FUNCTION public.log_price_change()
RETURNS trigger AS '
DECLARE
  etype  text   := TG_ARGV[0];
  cols   text[] := TG_ARGV[1:array_length(TG_ARGV, 1) - 1];
  c      text;
  oldrow jsonb;
  newrow jsonb  := to_jsonb(NEW);
  o      text;
  n      text;
BEGIN
  -- OLD is unassigned on INSERT and reading it raises; an empty object gives
  -- the same result — every value reads as a change from nothing.
  IF TG_OP = ''INSERT'' THEN
    oldrow := ''{}''::jsonb;
  ELSE
    oldrow := to_jsonb(OLD);
  END IF;

  FOREACH c IN ARRAY cols LOOP
    o := oldrow ->> c;
    n := newrow ->> c;
    IF o IS DISTINCT FROM n THEN
      INSERT INTO public.price_history (
        entity_type, entity_id, field,
        old_value, new_value, old_text, new_text,
        currency, reason, changed_by
      ) VALUES (
        etype, NEW.id, c,
        CASE WHEN jsonb_typeof(oldrow -> c) = ''number'' THEN (oldrow ->> c)::numeric END,
        CASE WHEN jsonb_typeof(newrow -> c) = ''number'' THEN (newrow ->> c)::numeric END,
        CASE WHEN jsonb_typeof(oldrow -> c) = ''number'' THEN NULL ELSE o END,
        CASE WHEN jsonb_typeof(newrow -> c) = ''number'' THEN NULL ELSE n END,
        newrow ->> ''currency'',
        NEW.price_change_reason,
        -- A user without a profile row must not have their save rejected by
        -- the foreign key; record the change without an author instead.
        (SELECT p.id FROM public.user_profiles p WHERE p.id = auth.uid())
      );
    END IF;
  END LOOP;

  -- The reason belongs in the log, not on the row.
  NEW.price_change_reason := NULL;
  RETURN NEW;
END;
' LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

COMMENT ON FUNCTION public.log_price_change() IS 'Writes price_history rows for any watched column that changed. Args: entity_type, then column names.';

-- ── Attach it. Entered prices only — no derived landed costs ──
DROP TRIGGER IF EXISTS trg_price_ingredients ON public.ingredients;
CREATE TRIGGER trg_price_ingredients
  BEFORE INSERT OR UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.log_price_change(
    'ingredient', 'price', 'freight', 'cost_per_unit', 'currency');

DROP TRIGGER IF EXISTS trg_price_packaging ON public.packaging;
CREATE TRIGGER trg_price_packaging
  BEFORE INSERT OR UPDATE ON public.packaging
  FOR EACH ROW EXECUTE FUNCTION public.log_price_change(
    'packaging', 'price', 'freight_per_unit_nzd', 'currency');

DROP TRIGGER IF EXISTS trg_price_products ON public.products;
CREATE TRIGGER trg_price_products
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_price_change(
    'product', 'rrp', 'rrp_au', 'toll', 'toll_au', 'margin', 'other',
    'freight', 'freight_nz', 'freight_au');

-- ── Row level security ─────────────────────────────────────
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_history_select ON public.price_history;
CREATE POLICY price_history_select ON public.price_history
  FOR SELECT TO authenticated USING (true);

-- The trigger is SECURITY DEFINER, so it writes regardless. Corrections to the
-- log itself are admin-only; nobody edits history through the app.
DROP POLICY IF EXISTS price_history_admin_write ON public.price_history;
CREATE POLICY price_history_admin_write ON public.price_history
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ── Carry across the ingredient history we already have ─────
INSERT INTO public.price_history (
  entity_type, entity_id, field, new_value, reason, changed_by, changed_at
)
SELECT 'ingredient', h.ingredient_id, 'price', h.price,
       'Migrated from ingredient price history (' || h.change_reason || ')',
       h.changed_by, h.changed_at
FROM public.ingredient_price_history h
WHERE h.price IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.price_history p
    WHERE p.entity_id = h.ingredient_id AND p.changed_at = h.changed_at AND p.field = 'price'
  );

-- ── Baseline: today's price for anything with no history yet ─
-- History starts now; earlier values were overwritten and can't be recovered.
INSERT INTO public.price_history (entity_type, entity_id, field, new_value, currency, reason)
SELECT 'ingredient', i.id, f.field, f.val, i.currency, 'Starting baseline'
FROM public.ingredients i
CROSS JOIN LATERAL (VALUES ('price', i.price), ('freight', i.freight), ('cost_per_unit', i.cost_per_unit)) AS f(field, val)
WHERE f.val IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.price_history p WHERE p.entity_id = i.id AND p.field = f.field);

INSERT INTO public.price_history (entity_type, entity_id, field, new_value, currency, reason)
SELECT 'packaging', k.id, f.field, f.val, k.currency, 'Starting baseline'
FROM public.packaging k
CROSS JOIN LATERAL (VALUES ('price', k.price), ('freight_per_unit_nzd', k.freight_per_unit_nzd)) AS f(field, val)
WHERE f.val IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.price_history p WHERE p.entity_id = k.id AND p.field = f.field);

INSERT INTO public.price_history (entity_type, entity_id, field, new_value, reason)
SELECT 'product', pr.id, f.field, f.val, 'Starting baseline'
FROM public.products pr
CROSS JOIN LATERAL (VALUES
  ('rrp', pr.rrp), ('rrp_au', pr.rrp_au), ('toll', pr.toll), ('toll_au', pr.toll_au),
  ('margin', pr.margin), ('other', pr.other), ('freight', pr.freight),
  ('freight_nz', pr.freight_nz), ('freight_au', pr.freight_au)) AS f(field, val)
WHERE f.val IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.price_history p WHERE p.entity_id = pr.id AND p.field = f.field);

COMMIT;
