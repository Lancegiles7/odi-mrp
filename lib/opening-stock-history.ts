/**
 * Shared shape for a single opening-stock audit row, used by the
 * generic OpeningStockHistoryPopover and by every entity-specific
 * history table (products, ingredients, packaging). All three
 * tables share the same columns, so a single shape suffices.
 */
export interface OpeningStockHistoryRow {
  id:               string
  previous_value:   number | null
  new_value:        number | null
  note:             string | null
  changed_at:       string
  changed_by_name:  string | null
}

export interface UpdateResult {
  ok:    boolean
  error?: string
}

export interface HistoryFetchResult {
  ok:    boolean
  rows:  OpeningStockHistoryRow[]
  error?: string
}
