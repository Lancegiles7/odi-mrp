-- ============================================================
-- Stock Movements — free-text monthly notes.
--
-- One note per Stock Movements tab (scope) × month, for month commentary
-- (supplier delays, stocktake caveats, one-offs, etc.). Kept separate per tab:
-- finished goods / ingredients / packaging each have their own notes.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stock_movement_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text        NOT NULL,              -- which tab the note belongs to
  year_month  date        NOT NULL,              -- day 1 of the month
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.user_profiles(id),

  CONSTRAINT stock_movement_notes_scope_check CHECK (scope IN ('products','ingredients','packaging')),
  CONSTRAINT stock_movement_notes_month_day1  CHECK (EXTRACT(DAY FROM year_month) = 1),
  UNIQUE (scope, year_month)
);

CREATE TRIGGER trg_stock_movement_notes_updated_at
  BEFORE UPDATE ON public.stock_movement_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_movement_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_movement_notes_select" ON public.stock_movement_notes;
CREATE POLICY "stock_movement_notes_select" ON public.stock_movement_notes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "stock_movement_notes_write" ON public.stock_movement_notes;
CREATE POLICY "stock_movement_notes_write" ON public.stock_movement_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.stock_movement_notes IS 'Free-text monthly notes for the Stock Movements tabs (products/ingredients/packaging), one per scope × month.';
