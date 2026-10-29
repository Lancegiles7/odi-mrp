-- ============================================================
-- Forecast (demand) upload audit trail + per-upload change set.
--
-- Every time the "MRP Units Upload" XLSX is imported through
-- /demand/import, we record ONE log row (when, who, file name, which
-- financial years, how many figures moved, an optional note) plus the
-- exact set of cells that changed (old → new) so the Demand page can
-- show "what changed vs the previous upload".
--
-- Only cells that actually MOVED are stored in demand_upload_changes
-- (old_units <> new_units), so the table stays small. old_units = NULL
-- means the cell did not exist before this upload; new_units = 0 means
-- the import cleared a value that used to be there.
--
-- Run in the Supabase SQL editor before deploying the code. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.demand_upload_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  uploaded_by   uuid REFERENCES public.user_profiles(id),
  file_name     text,
  fiscal_years  text[] NOT NULL DEFAULT '{}',   -- e.g. {FY27,FY28,FY29}
  cells_changed integer NOT NULL DEFAULT 0,      -- figures that moved
  cells_written integer NOT NULL DEFAULT 0,      -- figures upserted this run
  cells_skipped integer NOT NULL DEFAULT 0,      -- manual (edited) cells left untouched
  note          text,                            -- free text, e.g. "from Model v5"
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demand_upload_log_uploaded_at_idx
  ON public.demand_upload_log (uploaded_at DESC);

CREATE TABLE IF NOT EXISTS public.demand_upload_changes (
  id          bigserial PRIMARY KEY,
  upload_id   uuid NOT NULL REFERENCES public.demand_upload_log(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES public.products(id) ON DELETE CASCADE,
  channel     text NOT NULL,
  year_month  date NOT NULL,
  old_units   integer,              -- NULL = cell didn't exist before
  new_units   integer NOT NULL      -- 0 = value cleared by this import
);

CREATE INDEX IF NOT EXISTS demand_upload_changes_upload_idx
  ON public.demand_upload_changes (upload_id);

ALTER TABLE public.demand_upload_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_upload_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demand_upload_log_rw ON public.demand_upload_log;
CREATE POLICY demand_upload_log_rw ON public.demand_upload_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS demand_upload_changes_rw ON public.demand_upload_changes;
CREATE POLICY demand_upload_changes_rw ON public.demand_upload_changes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
