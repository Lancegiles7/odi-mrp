'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  createPurchaseOrder, updatePurchaseOrder, setPoStatus, deleteDraftPo,
  type POLineInput,
} from '@/app/(dashboard)/purchase-orders/actions'
import { PRODUCT_GROUPS, PRODUCT_GROUP_LABELS } from '@/lib/constants'

export interface SiteOption {
  id: string
  name: string
  site_type: 'manufacturer' | 'dc' | null
  address: string | null
}
export interface ProductOption {
  id: string
  sku_code: string
  name: string
  product_type: string | null
}
export interface PackagingOption {
  id: string
  sku_code: string
  name: string
}
export interface SrtInfo { name: string; unitsPerSrt: number }
export interface TransferLine {
  product_id: string
  group: string          // UI filter only
  pack: 'individual' | 'srt'
  quantity: string       // number of packs (individual units, or SRTs)
}
export interface TransferPkgLine {
  packaging_id: string
  quantity: string
}

interface Props {
  mode: 'new' | 'edit'
  id?: string
  status?: 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled'
  initialPoNumber: string
  initialFromId: string
  initialToId: string
  initialMarket: 'NZ' | 'AU'
  initialPickupDate: string | null
  initialExpectedDate: string | null
  initialTransportProvider: string | null
  initialNotes: string | null
  initialLines: TransferLine[]
  initialPkgLines: TransferPkgLine[]
  sites: SiteOption[]
  products: ProductOption[]
  packaging: PackagingOption[]
  /** product_id → SRT pack info, when the product has an SRT packaging. */
  srtByProduct: Record<string, SrtInfo>
}

const groupLabel = (g: string | null) => (g ? (PRODUCT_GROUP_LABELS[g] ?? g) : 'Ungrouped')
const emptyLine = (): TransferLine => ({ product_id: '', group: '', pack: 'individual', quantity: '' })
const emptyPkgLine = (): TransferPkgLine => ({ packaging_id: '', quantity: '' })
const nf = (n: number) => n.toLocaleString()

export function TransferForm(props: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [fromId, setFromId]   = useState(props.initialFromId)
  const [toId, setToId]       = useState(props.initialToId)
  const [market, setMarket]   = useState<'NZ' | 'AU'>(props.initialMarket)
  const [pickupDate, setPickupDate]     = useState(props.initialPickupDate ?? '')
  const [expectedDate, setExpectedDate] = useState(props.initialExpectedDate ?? '')
  const [transport, setTransport]       = useState(props.initialTransportProvider ?? '')
  const [notes, setNotes]     = useState(props.initialNotes ?? '')
  const [lines, setLines]     = useState<TransferLine[]>(
    props.initialLines.length ? props.initialLines : [emptyLine()],
  )
  const [pkgLines, setPkgLines] = useState<TransferPkgLine[]>(props.initialPkgLines)

  const readOnly = props.mode === 'edit' && props.status != null && !['draft', 'submitted'].includes(props.status)
  const toSite = props.sites.find((s) => s.id === toId) ?? null

  const srtFor = (productId: string) => props.srtByProduct[productId]
  const lineUnits = (l: TransferLine) => {
    const qty = Number(l.quantity) || 0
    const per = l.pack === 'srt' ? (srtFor(l.product_id)?.unitsPerSrt ?? 1) : 1
    return qty * per
  }
  // Three-way total: loose units, SRTs, and everything as individual units.
  const totals = lines.reduce(
    (acc, l) => {
      const qty = Number(l.quantity) || 0
      if (!l.product_id || qty <= 0) return acc
      if (l.pack === 'srt') { acc.srts += qty; acc.combined += lineUnits(l) }
      else { acc.individual += qty; acc.combined += qty }
      return acc
    },
    { individual: 0, srts: 0, combined: 0 },
  )

  // Group options present in the product catalogue, ordered by PRODUCT_GROUPS.
  const groups = useMemo(() => {
    const present = new Set(props.products.map((p) => p.product_type ?? ''))
    return PRODUCT_GROUPS.map((g) => g.value as string).filter((v) => present.has(v))
  }, [props.products])

  const pkgTotal = pkgLines.reduce((s, l) => s + (l.packaging_id && Number(l.quantity) > 0 ? Number(l.quantity) : 0), 0)

  function patchLine(i: number, patch: Partial<TransferLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine()     { setLines((ls) => [...ls, emptyLine()]) }
  function removeLine(i: number) { setLines((ls) => (ls.length === 1 ? [emptyLine()] : ls.filter((_, idx) => idx !== i))) }

  function patchPkg(i: number, patch: Partial<TransferPkgLine>) {
    setPkgLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addPkg()      { setPkgLines((ls) => [...ls, emptyPkgLine()]) }
  function removePkg(i: number) { setPkgLines((ls) => ls.filter((_, idx) => idx !== i)) }

  function toPoLines(): POLineInput[] {
    const productRows: POLineInput[] = lines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => {
        const isSrt = l.pack === 'srt' && !!srtFor(l.product_id)
        const per = isSrt ? (srtFor(l.product_id)!.unitsPerSrt) : 1
        return {
          line_type: 'product' as const,
          ingredient_id: null,
          product_id: l.product_id,
          packaging_id: null,
          description: null,
          quantity_ordered: Number(l.quantity),   // number of packs
          unit_cost: null,
          unit_of_measure: isSrt ? 'SRT' : 'units',
          notes: null,
          // Units per pack — lets the ledger/PDF show combined individual units.
          supplier_pack_size: per,
        }
      })
    const pkgRows: POLineInput[] = pkgLines
      .filter((l) => l.packaging_id && Number(l.quantity) > 0)
      .map((l) => ({
        line_type: 'packaging' as const,
        ingredient_id: null,
        product_id: null,
        packaging_id: l.packaging_id,
        description: null,
        quantity_ordered: Number(l.quantity),
        unit_cost: null,
        unit_of_measure: 'units',
        notes: null,
      }))
    return [...productRows, ...pkgRows]
  }

  function validate(): string | null {
    if (!fromId) return 'Choose a From site.'
    if (!toId) return 'Choose a To site.'
    if (fromId === toId) return 'From and To sites must be different.'
    const poLines = toPoLines()
    if (poLines.length === 0) return 'Add at least one product or packaging item with a quantity.'
    return null
  }

  function save(then: 'view' | 'submit') {
    const v = validate()
    if (v) { setError(v); return }
    setError(null)
    const today = new Date()
    const orderDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const common = {
      po_number: props.initialPoNumber,
      po_type: 'transfer' as const,
      supplier_id: fromId,
      destination_supplier_id: toId,
      pickup_date: pickupDate || null,
      transport_provider: transport.trim() || null,
      currency: 'NZD',
      market,
      issuer_id: null,
      company_id: null,
      order_date: orderDate,
      expected_delivery_date: expectedDate || null,
      delivery_address_id: null,
      delivery_notes: null,
      notes: notes.trim() || null,
      external_notes: null,
      lines: toPoLines(),
    }
    start(async () => {
      let poId = props.id
      if (props.mode === 'new') {
        const res = await createPurchaseOrder(common)
        if (!res.ok || !res.id) { setError(res.error ?? 'Could not create transfer'); return }
        poId = res.id
      } else {
        const res = await updatePurchaseOrder({ id: props.id!, ...common })
        if (!res.ok) { setError(res.error ?? 'Could not save transfer'); return }
      }
      if (then === 'submit' && poId) {
        const res = await setPoStatus(poId, 'submitted')
        if (!res.ok) { setError(res.error ?? 'Saved, but could not submit'); return }
      }
      router.push(`/purchase-orders/${poId}`)
      router.refresh()
    })
  }

  function cancelTransfer() {
    if (!props.id) return
    start(async () => {
      const res = await setPoStatus(props.id!, 'cancelled')
      if (!res.ok) { setError(res.error ?? 'Could not cancel'); return }
      router.push('/purchase-orders'); router.refresh()
    })
  }
  function discardDraft() {
    if (!props.id) return
    start(async () => {
      const res = await deleteDraftPo(props.id!)
      if (!res.ok) { setError(res.error ?? 'Could not delete'); return }
      router.push('/purchase-orders'); router.refresh()
    })
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/purchase-orders" className="text-sm text-gray-500 hover:underline">Purchase Orders</Link>
            <span className="text-gray-300">/</span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">Transfer</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">{props.initialPoNumber}</h1>
        </div>
        <div className="flex items-center gap-2">
          {props.mode === 'edit' && props.id && (
            <a href={`/purchase-orders/${props.id}/print`} target="_blank" rel="noopener noreferrer"
              className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">
              Print / PDF
            </a>
          )}
          {props.mode === 'edit' && props.status && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 capitalize">{props.status}</span>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
          This transfer is {props.status} and can no longer be edited.
        </div>
      )}

      {/* Route + market */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <SiteField label="From site" value={fromId} onChange={setFromId} sites={props.sites} disabled={readOnly} exclude={toId} />
          <div className="hidden sm:block text-xl text-emerald-700 pb-2 text-center">→</div>
          <SiteField label="To site" value={toId} onChange={setToId} sites={props.sites} disabled={readOnly} exclude={fromId} />
        </div>
        <p className="text-xs text-gray-500 mt-2">Sites are your manufacturers and distribution centres. Either can be the origin or destination.</p>

        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Market</label>
          <div className="inline-flex gap-1.5">
            {(['NZ', 'AU'] as const).map((m) => (
              <button key={m} type="button" disabled={readOnly}
                onClick={() => setMarket(m)}
                className={`text-sm font-semibold px-4 py-1.5 rounded-lg border ${market === m ? (m === 'NZ' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-sky-50 text-sky-800 border-sky-300') : 'bg-white text-gray-500 border-gray-200'} disabled:opacity-60`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Logistics */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Pick-up date</label>
            <input type="date" value={pickupDate} disabled={readOnly}
              onChange={(e) => setPickupDate(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white disabled:bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Expected delivery</label>
            <input type="date" value={expectedDate} disabled={readOnly} min={pickupDate || undefined}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white disabled:bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Transport provider</label>
            <input type="text" value={transport} disabled={readOnly}
              onChange={(e) => setTransport(e.target.value)}
              placeholder="e.g. Mainfreight"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white disabled:bg-gray-50" />
          </div>
        </div>

        {toSite?.address && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
            <div className="font-semibold text-gray-800">{toSite.name}{toSite.site_type === 'dc' && <span className="ml-2 text-[10px] font-bold uppercase text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5">DC</span>}</div>
            <div className="whitespace-pre-line">{toSite.address}</div>
          </div>
        )}
      </div>

      {/* Products */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Products to move</h2>
          <span className="text-xs text-gray-500 tabular-nums">{nf(totals.combined)} units total</span>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="grid grid-cols-[150px_minmax(0,1fr)_150px_80px_32px] gap-2 px-4 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-400">
            <div>Product group</div><div>Product</div><div>Pack</div><div className="text-right">Qty</div><div></div>
          </div>
          {lines.map((l, i) => {
            const options = props.products.filter((p) => !l.group || (p.product_type ?? '') === l.group)
            const srt = srtFor(l.product_id)
            const units = lineUnits(l)
            return (
              <div key={i} className="grid grid-cols-[150px_minmax(0,1fr)_150px_80px_32px] gap-2 px-4 py-2 items-start">
                <select value={l.group} disabled={readOnly}
                  onChange={(e) => patchLine(i, { group: e.target.value, product_id: '', pack: 'individual' })}
                  className="w-full min-w-0 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white disabled:bg-gray-50">
                  <option value="">All groups</option>
                  {groups.map((g) => <option key={g} value={g}>{groupLabel(g)}</option>)}
                </select>
                <select value={l.product_id} disabled={readOnly}
                  onChange={(e) => patchLine(i, { product_id: e.target.value, pack: 'individual' })}
                  className="w-full min-w-0 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white disabled:bg-gray-50">
                  <option value="">— Select product —</option>
                  {options.map((p) => <option key={p.id} value={p.id}>{p.sku_code} · {p.name}</option>)}
                </select>
                <div className="min-w-0">
                  <select value={l.pack} disabled={readOnly || !l.product_id}
                    onChange={(e) => patchLine(i, { pack: e.target.value as 'individual' | 'srt' })}
                    className="w-full min-w-0 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white disabled:bg-gray-50">
                    <option value="individual">Individual unit</option>
                    {srt && <option value="srt">{srt.name} (×{srt.unitsPerSrt})</option>}
                  </select>
                  {l.pack === 'srt' && srt && Number(l.quantity) > 0 && (
                    <div className="text-[10px] text-gray-400 mt-0.5">= {nf(units)} units</div>
                  )}
                </div>
                <input type="number" min={0} step="any" value={l.quantity} disabled={readOnly}
                  onChange={(e) => patchLine(i, { quantity: e.target.value })}
                  placeholder="0"
                  className="w-full min-w-0 text-sm text-right border border-gray-200 rounded px-2 py-1.5 tabular-nums bg-white disabled:bg-gray-50" />
                <button type="button" disabled={readOnly} onClick={() => removeLine(i)}
                  className="text-gray-400 hover:text-rose-600 disabled:opacity-40 text-sm pt-1.5">✕</button>
              </div>
            )
          })}
        </div>

        {/* Three-way total */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-gray-500">Total:</span>
          <span><span className="font-semibold tabular-nums">{nf(totals.individual)}</span> individual units</span>
          <span><span className="font-semibold tabular-nums">{nf(totals.srts)}</span> SRTs</span>
          <span className="text-gray-900"><span className="font-semibold tabular-nums">{nf(totals.combined)}</span> units combined</span>
        </div>

        {!readOnly && (
          <div className="px-4 py-3 border-t border-gray-100">
            <button type="button" onClick={addLine}
              className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-dashed border-emerald-300 rounded-lg px-3 py-1.5">
              ＋ Add product line
            </button>
          </div>
        )}
      </div>

      {/* Packaging */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Packaging to move</h2>
          <span className="text-xs text-gray-500 tabular-nums">{nf(pkgTotal)} units</span>
        </div>
        {pkgLines.length > 0 && (
          <div className="divide-y divide-gray-100">
            <div className="grid grid-cols-[minmax(0,1fr)_80px_32px] gap-2 px-4 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-400">
              <div>Packaging item</div><div className="text-right">Qty</div><div></div>
            </div>
            {pkgLines.map((l, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_80px_32px] gap-2 px-4 py-2 items-center">
                <select value={l.packaging_id} disabled={readOnly}
                  onChange={(e) => patchPkg(i, { packaging_id: e.target.value })}
                  className="w-full min-w-0 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white disabled:bg-gray-50">
                  <option value="">— Select packaging —</option>
                  {props.packaging.map((p) => <option key={p.id} value={p.id}>{p.sku_code} · {p.name}</option>)}
                </select>
                <input type="number" min={0} step="any" value={l.quantity} disabled={readOnly}
                  onChange={(e) => patchPkg(i, { quantity: e.target.value })}
                  placeholder="0"
                  className="w-full min-w-0 text-sm text-right border border-gray-200 rounded px-2 py-1.5 tabular-nums bg-white disabled:bg-gray-50" />
                <button type="button" disabled={readOnly} onClick={() => removePkg(i)}
                  className="text-gray-400 hover:text-rose-600 disabled:opacity-40 text-sm">✕</button>
              </div>
            ))}
          </div>
        )}
        {!readOnly && (
          <div className="px-4 py-3 border-t border-gray-100">
            <button type="button" onClick={addPkg}
              className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-dashed border-emerald-300 rounded-lg px-3 py-1.5">
              ＋ Add packaging line
            </button>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Notes</label>
        <textarea value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional — e.g. transport company, reference, special handling"
          className="w-full text-sm border border-gray-200 rounded p-2 min-h-[64px] disabled:bg-gray-50" />
      </div>

      {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}

      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" disabled={pending} onClick={() => save('view')}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60">
            {props.mode === 'new' ? 'Create transfer' : 'Save changes'}
          </button>
          {(props.mode === 'new' || props.status === 'draft') && (
            <button type="button" disabled={pending} onClick={() => save('submit')}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-60">
              Save &amp; submit
            </button>
          )}
          <Link href="/purchase-orders" className="text-sm text-gray-500 hover:underline ml-1">Cancel</Link>
          <div className="ml-auto flex items-center gap-2">
            {props.mode === 'edit' && props.status === 'draft' && (
              <button type="button" disabled={pending} onClick={discardDraft} className="text-sm text-rose-600 hover:underline">Delete draft</button>
            )}
            {props.mode === 'edit' && props.status === 'submitted' && (
              <button type="button" disabled={pending} onClick={cancelTransfer} className="text-sm text-rose-600 hover:underline">Cancel transfer</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SiteField({
  label, value, onChange, sites, disabled, exclude,
}: {
  label: string; value: string; onChange: (v: string) => void
  sites: SiteOption[]; disabled?: boolean; exclude?: string
}) {
  const manufacturers = sites.filter((s) => s.site_type === 'manufacturer')
  const dcs = sites.filter((s) => s.site_type === 'dc')
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{label}</label>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white disabled:bg-gray-50">
        <option value="">— Select site —</option>
        {manufacturers.length > 0 && (
          <optgroup label="Manufacturers">
            {manufacturers.map((s) => <option key={s.id} value={s.id} disabled={s.id === exclude}>{s.name}</option>)}
          </optgroup>
        )}
        {dcs.length > 0 && (
          <optgroup label="Distribution centres">
            {dcs.map((s) => <option key={s.id} value={s.id} disabled={s.id === exclude}>{s.name}</option>)}
          </optgroup>
        )}
      </select>
    </div>
  )
}
