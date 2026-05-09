/**
 * Packaging loaded-cost helpers.
 *
 * Loaded cost (NZD per unit) = (price × FX rate to NZD) + freight_per_unit_nzd
 *
 * FX rate resolution:
 *   1. If fx_rate_override is set on the packaging row → use that
 *   2. Else look up the rate for the packaging's currency in app_settings.fx_rates
 *   3. Else fall back to 1.0 (treat as already-NZD)
 */

import type { CurrencyCode } from './constants'

export type FxRates = Record<string, number>

export interface PackagingCostInput {
  price: number | null | undefined
  currency: CurrencyCode | string | null | undefined
  fx_rate_override: number | null | undefined
  freight_per_unit_nzd: number | null | undefined
}

export function resolveFxRate(currency: string | null | undefined, override: number | null | undefined, table: FxRates | null | undefined): number {
  if (override != null && Number.isFinite(override) && override > 0) return Number(override)
  if (!currency) return 1
  if (currency === 'NZD') return 1
  const rate = table?.[currency]
  if (rate != null && Number.isFinite(rate) && rate > 0) return Number(rate)
  return 1   // last-resort fallback (shows as raw price if rate missing)
}

export function computeLoadedNzd(input: PackagingCostInput, fxTable: FxRates | null | undefined): number {
  const price   = Number(input.price)   || 0
  const freight = Number(input.freight_per_unit_nzd) || 0
  const rate    = resolveFxRate(input.currency, input.fx_rate_override, fxTable)
  return price * rate + freight
}
