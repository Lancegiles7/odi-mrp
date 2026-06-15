-- Tag each purchase order with the build it's for: NZ (Brand Nation) or AU (VMC).
--
-- A PO is raised by one entity to one supplier, so the market lives on the PO
-- header. Every existing PO is NZ (the default), so nothing changes for current
-- orders. AU POs then feed the AU demand view's arrivals.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'NZ';

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_market_check;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_market_check CHECK (market IN ('NZ', 'AU'));

COMMENT ON COLUMN public.purchase_orders.market IS 'Which build the PO is for: NZ (Brand Nation) or AU (VMC). Drives which market''s demand its arrivals offset.';
