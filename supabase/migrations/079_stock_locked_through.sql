-- Stock lock: freeze all finished-goods stock data on or before a chosen month.
-- `stock_locked_through` holds the first day of the last LOCKED month
-- (e.g. '2026-09-01' = everything up to 30 Sep 2026 is frozen); NULL = no lock.
-- Imports and edits for months <= this value are skipped; later months behave
-- normally. Admin-only to set/clear (enforced in the server action).
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS stock_locked_through date,
  ADD COLUMN IF NOT EXISTS stock_locked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS stock_locked_by   uuid;
