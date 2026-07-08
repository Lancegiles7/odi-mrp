'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  createPurchaseOrder, updatePurchaseOrder, deleteDraftPo, setPoStatus,
  type POLineInput,
} from '@/app/(dashboard)/purchase-orders/actions'
import { paymentTermsLabel, SUPPORTED_CURRENCIES } from '@/lib/constants'

interface SupplierOption {
  id: string
  name: string
  payment_terms: string | null
  email: string | null
  phone: string | null
  currency: string | null
}

interface IngredientOption {
  id: string
  sku_code: string
  name: string
  unit_of_measure: string | null
  // Saved supplier reference data — pre-fills new PO lines
  supplier_sku_code:  string | null
  supplier_pack_size: number | null
  supplier_pack_unit: string | null
  price:              number | null
  currency:           string | null     // price is denominated in this currency
}

interface ProductOption {
  id: string
  sku_code: string
  name: string
}

interface PackagingOption {
  id: string
  sku_code: string
  name: string
  unit_of_measure: string
  supplier_sku_code: string | null
  supplier_pack_size: number | null
  supplier_pack_unit: string | null
  price: number | null            // supplier-currency price (what we PO at)
  currency: string | null         // the packaging item's currency
  total_loaded_cost_nzd: number | null
}

interface DeliveryAddressOption {
  id: string
  label: string
  street: string
  contact_name: string | null
  phone: string | null
  country: 'NZ' | 'AU'
  is_default: boolean
}

export interface IssuerOption { id: string; name: string; title: string | null; is_default: boolean }
export interface CompanyOption { id: string; legal_name: string; country: string | null; is_default: boolean }

export interface POFormProps {
  mode: 'new' | 'edit'
  poId?: string
  initialPoNumber: string
  initialSupplierId: string
  initialCurrency: string          // 'NZD' default
  initialMarket?: string           // 'NZ' default — which build the PO is for
  fxRate?: number                  // NZD per 1 AUD — converts ingredient/packaging price to the PO currency
  initialIssuerId: string | null
  initialCompanyId: string | null
  initialOrderDate: string         // 'YYYY-MM-DD'
  initialExpected: string | null   // 'YYYY-MM-DD' or null
  initialDeliveryAddressId: string | null
  initialDeliveryNotes: string | null
  initialNotes: string | null
  initialExternalNotes?: string | null
  initialLines: POLineInput[]
  status: 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled'
  suppliers: SupplierOption[]
  ingredients: IngredientOption[]
  products: ProductOption[]
  packaging: PackagingOption[]
  deliveryAddresses: DeliveryAddressOption[]
  issuers: IssuerOption[]
  companies: CompanyOption[]
}

const NEW_LINE: POLineInput = {
  line_type: 'ingredient',
  ingredient_id: null,
  product_id: null,
  packaging_id: null,
  description: null,
  quantity_ordered: 0,
  unit_cost: null,
  unit_of_measure: 'kg',
  notes: null,
}

export function POForm(props: POFormProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [poNumber, setPoNumber]     = useState(props.initialPoNumber)
  const [supplierId, setSupplierId] = useState(props.initialSupplierId)
  const [currency, setCurrency]     = useState(props.initialCurrency || 'NZD')
  const [currencyManuallySet, setCurrencyManuallySet] = useState(props.mode === 'edit')
  const [market, setMarket]         = useState<'NZ' | 'AU'>(props.initialMarket === 'AU' ? 'AU' : 'NZ')
  const [issuerId, setIssuerId] = useState<string>(
    props.initialIssuerId ?? props.issuers.find((i) => i.is_default)?.id ?? props.issuers[0]?.id ?? '',
  )
  const [companyId, setCompanyId] = useState<string>(
    props.initialCompanyId ?? props.companies.find((c) => c.is_default)?.id ?? props.companies[0]?.id ?? '',
  )
  const [orderDate, setOrderDate]   = useState(props.initialOrderDate)
  const [expected, setExpected]     = useState(props.initialExpected ?? '')
  const [notes, setNotes]           = useState(props.initialNotes ?? '')
  const [externalNotes, setExternalNotes] = useState(props.initialExternalNotes ?? '')
  const [deliveryAddressId, setDeliveryAddressId] = useState(
    props.initialDeliveryAddressId
      ?? props.deliveryAddresses.find((a) => a.is_default && a.country === 'NZ')?.id
      ?? props.deliveryAddresses[0]?.id
      ?? '',
  )
  const [deliveryNotes, setDeliveryNotes] = useState(props.initialDeliveryNotes ?? '')
  const [lines, setLines]           = useState<POLineInput[]>(
    props.initialLines.length > 0 ? props.initialLines : [{ ...NEW_LINE }],
  )

  const isDraft       = props.status === 'draft'
  const isSubmitted   = props.status === 'submitted' || props.status === 'partially_received'
  // Editable while draft or submitted-but-untouched. Once anything has been
  // received (partially_received) we lock to protect receipt history; further
  // edits go through the receive flow only.
  const isEditable    = props.status === 'draft' || props.status === 'submitted'
  const supplier  = useMemo(
    () => props.suppliers.find((s) => s.id === supplierId) ?? null,
    [props.suppliers, supplierId],
  )

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.unit_cost) || 0) * (Number(l.quantity_ordered) || 0), 0),
    [lines],
  )

  function updateLine(idx: number, patch: Partial<POLineInput>) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l
      const next = { ...l, ...patch }
      // Clear off-target fields when type switches and reset UoM defaults:
      // ingredient → kg, product → each, packaging → each, other → leave.
      if (patch.line_type) {
        next.ingredient_id = patch.line_type === 'ingredient' ? next.ingredient_id : null
        next.product_id    = patch.line_type === 'product'    ? next.product_id    : null
        next.packaging_id  = patch.line_type === 'packaging'  ? next.packaging_id  : null
        next.description   = patch.line_type === 'other'      ? next.description   : null
        if (patch.line_type === 'ingredient') next.unit_of_measure = 'kg'
        if (patch.line_type === 'product')    next.unit_of_measure = 'each'
        if (patch.line_type === 'packaging')  next.unit_of_measure = 'each'
      }
      // Pre-fill from the selected ingredient's saved supplier reference
      // data. Only fill price when the ingredient's currency matches the
      // current PO currency — otherwise we'd silently mis-price the line.
      if (patch.ingredient_id && patch.ingredient_id !== l.ingredient_id) {
        const ing = props.ingredients.find((x) => x.id === patch.ingredient_id)
        if (ing) {
          // Order in the ingredient's own unit (e.g. 'each' for finished pouches,
          // 'kg' for bulk). Price prefill is per that unit, converted to the PO
          // currency when they differ (e.g. an AUD-priced ingredient on an NZD PO).
          if (ing.unit_of_measure) next.unit_of_measure = ing.unit_of_measure
          // Prefill the saved supplier price as-is (adjust per the PO currency
          // if needed). No silent FX conversion.
          if (next.unit_cost == null && ing.price != null) {
            next.unit_cost = Number(ing.price)
          }
        }
      }
      // Pre-fill from packaging item — its supplier-currency price (NOT the
      // NZD-loaded cost), converted to the PO currency when they differ.
      if (patch.packaging_id && patch.packaging_id !== l.packaging_id) {
        const pk = props.packaging.find((x) => x.id === patch.packaging_id)
        if (pk) {
          if (next.unit_cost == null && pk.price != null) {
            next.unit_cost = Number(pk.price)
          }
          if (pk.unit_of_measure) next.unit_of_measure = pk.unit_of_measure
        }
      }
      return next
    }))
  }

  function addLine() {
    setLines((prev) => [...prev, { ...NEW_LINE }])
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  function onSave(submitAfter: boolean = false) {
    setError(null)
    start(async () => {
      const payload = {
        po_number: poNumber,
        supplier_id: supplierId,
        currency,
        market,
        issuer_id: issuerId || null,
        company_id: companyId || null,
        order_date: orderDate,
        expected_delivery_date: expected || null,
        delivery_address_id: deliveryAddressId || null,
        delivery_notes: deliveryNotes || null,
        notes: notes || null,
        external_notes: externalNotes || null,
        lines,
      }
      const res = props.mode === 'new'
        ? await createPurchaseOrder(payload)
        : await updatePurchaseOrder({ id: props.poId!, ...payload })

      if (!res.ok) { setError(res.error ?? 'Save failed'); return }

      const targetId = props.mode === 'new' ? res.id! : props.poId!

      if (submitAfter) {
        const sub = await setPoStatus(targetId, 'submitted')
        if (!sub.ok) { setError(sub.error ?? 'Could not submit'); return }
      }

      router.push(`/purchase-orders/${targetId}`)
      router.refresh()
    })
  }

  function onCancelPo() {
    if (!props.poId) return
    if (!confirm('Cancel this PO? This cannot be undone.')) return
    setError(null)
    start(async () => {
      const res = await setPoStatus(props.poId!, 'cancelled')
      if (!res.ok) { setError(res.error ?? 'Could not cancel'); return }
      router.refresh()
    })
  }

  function onDelete() {
    if (!props.poId) return
    if (!confirm(`Permanently delete PO ${poNumber}? This cannot be undone. (Blocked if any stock receipts have been recorded against it.)`)) return
    setError(null)
    start(async () => {
      const res = await deleteDraftPo(props.poId!)
      if (!res.ok) setError(res.error ?? 'Could not delete')
      // server action redirects on success
    })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <Link href="/purchase-orders" className="text-xs text-gray-500 hover:underline">← All POs</Link>
          <h1 className="text-base font-semibold">
            {props.mode === 'new' ? 'New purchase order' : poNumber}
          </h1>
          {props.mode === 'edit' && (
            <StatusPill status={props.status} />
          )}
        </div>
        <div className="flex items-center gap-2">
          {props.mode === 'edit' && !isDraft && props.status !== 'cancelled' && (
            <Link
              href={`/purchase-orders/${props.poId}/print`}
              target="_blank"
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
            >
              ⤓ View / print PDF
            </Link>
          )}
          {props.mode === 'edit' && isSubmitted && (
            <Link
              href={`/purchase-orders/${props.poId}/receive`}
              className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-800"
            >
              📦 Receive items
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-0">
        <div className="col-span-2 p-5 border-r border-gray-100 space-y-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Supplier">
              <select
                disabled={!isEditable}
                value={supplierId}
                onChange={(e) => {
                  const newId = e.target.value
                  setSupplierId(newId)
                  // Auto-default currency to supplier's currency on supplier change
                  // (only if user hasn't manually picked one yet).
                  if (!currencyManuallySet) {
                    const sup = props.suppliers.find((s) => s.id === newId)
                    if (sup?.currency) setCurrency(sup.currency.toUpperCase())
                  }
                }}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                <option value="">— Select a supplier —</option>
                {props.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.currency ? ` (${s.currency})` : ''}</option>
                ))}
              </select>
              {supplier && (
                <p className="text-[11px] text-gray-500 mt-1">
                  {supplier.payment_terms ? paymentTermsLabel(supplier.payment_terms) : 'Payment terms not set'}{supplier.email ? ` · ${supplier.email}` : ''}
                </p>
              )}
            </Field>

            <Field label={`Currency · prices in ${currency}`}>
              <select
                disabled={!isEditable}
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); setCurrencyManuallySet(true) }}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {supplier?.currency && supplier.currency.toUpperCase() !== currency && (
                <p className="text-[11px] text-amber-700 mt-1">
                  ⚠ supplier&apos;s currency is {supplier.currency.toUpperCase()} — overriding to {currency}
                </p>
              )}
            </Field>

            <Field label="Build / market">
              <select
                disabled={!isEditable}
                value={market}
                onChange={(e) => setMarket(e.target.value === 'AU' ? 'AU' : 'NZ')}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                <option value="NZ">NZ · Brand Nation</option>
                <option value="AU">AU · VMC</option>
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Which build this order replenishes. Drives the matching market on Ingredient / Packaging demand.
              </p>
            </Field>

            <Field label="From company">
              <select
                disabled={!isEditable}
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                {props.companies.length === 0 && <option value="">— no companies set up —</option>}
                {props.companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.legal_name}{c.country ? ` (${c.country})` : ''}{c.is_default ? ' ★' : ''}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Drives the PO PDF letterhead. Manage in <a href="/settings/companies" className="underline">Settings → PO companies</a>.
              </p>
            </Field>

            <Field label="Issued by">
              <select
                disabled={!isEditable}
                value={issuerId}
                onChange={(e) => setIssuerId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                {props.issuers.length === 0 && <option value="">— no issuers set up —</option>}
                {props.issuers.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}{i.title ? ` · ${i.title}` : ''}{i.is_default ? ' ★' : ''}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Manage the list in <a href="/settings/issuers" className="underline">Settings → PO issuers</a>.
              </p>
            </Field>

            <Field label="PO number">
              <input
                disabled={!isEditable}
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm font-mono disabled:bg-gray-50"
              />
              <p className="text-[11px] text-gray-500 mt-1">Auto-generated, editable while draft.</p>
            </Field>

            <Field label="Order date">
              <input
                disabled={!isEditable}
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
              />
            </Field>

            <Field label="Expected delivery">
              <input
                disabled={!isEditable}
                type="date"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
              />
            </Field>

            <Field label="Deliver to">
              <select
                disabled={!isEditable}
                value={deliveryAddressId}
                onChange={(e) => setDeliveryAddressId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                <option value="">— Select an address —</option>
                {props.deliveryAddresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {a.country}{a.is_default ? ' ★' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                <Link href="/delivery-addresses" target="_blank" className="text-blue-600 hover:underline">Manage addresses ↗</Link>
              </p>
            </Field>

            <Field label="Delivery notes (this PO)">
              <textarea
                disabled={!isEditable}
                rows={2}
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
                placeholder="e.g. Deliver between 9 am and noon · loading dock at rear"
              />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] uppercase tracking-wider text-gray-500">Line items</label>
              {isEditable && (
                <button onClick={addLine} className="text-xs text-blue-600 hover:underline">+ Add line</button>
              )}
            </div>
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="text-left px-3 py-2 font-medium w-[110px]">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Item</th>
                    <th className="text-left px-3 py-2 font-medium w-[120px]">Supplier code</th>
                    <th className="text-right px-3 py-2 font-medium w-[110px]">Qty</th>
                    <th className="text-left px-3 py-2 font-medium w-[60px]">UoM</th>
                    <th className="text-right px-3 py-2 font-medium w-[80px]">Pack size</th>
                    <th className="text-right px-3 py-2 font-medium w-[100px]">Unit price</th>
                    <th className="text-right px-3 py-2 font-medium w-[100px]">Line total</th>
                    {isEditable && <th className="w-[30px]"></th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <LineRow
                      key={i}
                      line={l}
                      ingredients={props.ingredients}
                      products={props.products}
                      packaging={props.packaging}
                      readOnly={!isEditable}
                      onChange={(patch) => updateLine(i, patch)}
                      onRemove={isEditable && lines.length > 1 ? () => removeLine(i) : undefined}
                    />
                  ))}
                  <tr className="border-t-2 border-gray-200 bg-gray-50 text-sm">
                    <td colSpan={7} className="px-3 py-2 text-right font-medium text-gray-700">Subtotal ({currency} ex-GST)</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    {isEditable && <td></td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <Field label="External note (shown on the PO)">
            <textarea
              disabled={!isEditable}
              rows={2}
              value={externalNotes}
              onChange={(e) => setExternalNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
              placeholder="Note printed on the PO for the supplier"
            />
          </Field>

          <Field label="Internal note (not shown on the PO)">
            <textarea
              disabled={!isEditable}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm disabled:bg-gray-50"
              placeholder="For your team only — quote refs, reminders, etc."
            />
          </Field>

          {isEditable && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              {isDraft ? (
                <>
                  <button
                    disabled={pending}
                    onClick={() => onSave(false)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    {pending ? 'Saving…' : 'Save draft'}
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => onSave(true)}
                    className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                  >
                    {pending ? 'Saving…' : 'Save & submit'}
                  </button>
                </>
              ) : (
                <button
                  disabled={pending}
                  onClick={() => onSave(false)}
                  className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                >
                  {pending ? 'Saving…' : 'Save changes'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-5 space-y-5 bg-gray-50/40">
          <div>
            <h4 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Supplier details</h4>
            <div className="text-sm bg-white border border-gray-200 rounded-md p-3 space-y-1">
              {supplier ? (
                <>
                  <div className="font-medium">{supplier.name}</div>
                  {supplier.email && <div className="text-xs text-gray-600">{supplier.email}</div>}
                  {supplier.phone && <div className="text-xs text-gray-600">{supplier.phone}</div>}
                  <div className="pt-2 mt-2 border-t border-gray-100 text-xs">
                    <span className="text-gray-500">Payment terms:</span>{' '}
                    <span className="font-medium">{paymentTermsLabel(supplier.payment_terms)}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400">Select a supplier above.</p>
              )}
            </div>
          </div>

          {props.mode === 'edit' && (
            <div className="pt-3 border-t border-gray-200 space-y-2">
              {props.status !== 'cancelled' && props.status !== 'received' && (
                <button
                  disabled={pending}
                  onClick={onCancelPo}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-white disabled:opacity-50"
                >
                  Cancel PO
                </button>
              )}
              <button
                disabled={pending}
                onClick={onDelete}
                className="w-full px-3 py-1.5 text-xs border border-red-300 rounded-md bg-white hover:bg-red-50 text-red-700 disabled:opacity-50"
              >
                {isDraft ? 'Delete draft' : 'Delete PO'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft:              'bg-gray-100 text-gray-600',
    submitted:          'bg-blue-100 text-blue-700',
    partially_received: 'bg-amber-100 text-amber-800',
    received:           'bg-emerald-100 text-emerald-700',
    cancelled:          'bg-gray-100 text-gray-500',
  }
  const lbl: Record<string, string> = {
    draft: 'Draft', submitted: 'Submitted', partially_received: 'Partial', received: 'Received', cancelled: 'Cancelled',
  }
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${map[status]}`}>{lbl[status]}</span>
}

function LineRow({
  line, ingredients, products, packaging, readOnly, onChange, onRemove,
}: {
  line: POLineInput
  ingredients: IngredientOption[]
  products: ProductOption[]
  packaging: PackagingOption[]
  readOnly: boolean
  onChange: (patch: Partial<POLineInput>) => void
  onRemove?: () => void
}) {
  const lineTotal = (Number(line.unit_cost) || 0) * (Number(line.quantity_ordered) || 0)
  const isIngredient = line.line_type === 'ingredient'
  const isPackaging  = line.line_type === 'packaging'
  // Both ingredients and packaging are purchased items with supplier reference
  // data (code, pack size). Products / "other" lines have none.
  const isPurchased  = isIngredient || isPackaging
  const ing = isIngredient && line.ingredient_id
    ? ingredients.find((x) => x.id === line.ingredient_id) ?? null
    : null
  const pk = isPackaging && line.packaging_id
    ? packaging.find((x) => x.id === line.packaging_id) ?? null
    : null
  // The supplier-reference source for this line (whichever item type it is).
  const ref = ing ?? pk
  const selectedId = line.ingredient_id ?? line.packaging_id ?? null

  // Effective values from the item master (ingredient/packaging), after edits.
  const lineSupSku   = line.save_back_supplier_data?.supplier_sku_code  ?? ref?.supplier_sku_code  ?? ''
  const linePackSize = line.save_back_supplier_data?.supplier_pack_size ?? ref?.supplier_pack_size ?? null
  const linePackUom  = line.save_back_supplier_data?.supplier_pack_unit ?? ref?.supplier_pack_unit ?? line.unit_of_measure
  // Saved values for diff-detection
  const savedSupSku   = ref?.supplier_sku_code  ?? null
  const savedPackSize = ref?.supplier_pack_size ?? null
  // Price drift / save-back stays ingredient-only (packaging loaded cost is
  // managed on the packaging page so a PO edit can't leave it stale).
  const savedPrice    = ing?.price              ?? null

  // Unified supplier code + pack size for the row. Ingredient/packaging route
  // to (and save back to) the item master; product / "other" lines store the
  // value on the PO line itself.
  const supCodeValue  = isPurchased ? lineSupSku   : (line.supplier_code ?? '')
  const packSizeValue = isPurchased ? linePackSize : (line.supplier_pack_size ?? null)
  const setSupCode  = (v: string)        => isPurchased ? patchSaveBack({ supplier_sku_code: v || null }) : onChange({ supplier_code: v || null })
  const setPackSize = (v: number | null) => isPurchased ? patchSaveBack({ supplier_pack_size: v })        : onChange({ supplier_pack_size: v })
  // Ingredient/packaging need an item selected first; product/"other" are free-text.
  const codeDisabled = readOnly || (isPurchased && !selectedId)

  // Pack-size compliance — soft warning + suggested round-up
  const qty = Number(line.quantity_ordered) || 0
  const packSize = Number(packSizeValue) || 0
  const packMismatch = packSize > 0 && qty > 0 && qty % packSize !== 0
  const suggestedQty = packMismatch ? Math.ceil(qty / packSize) * packSize : null

  // Price drift — soft warning when entered price differs from saved
  const priceDrift = isIngredient && savedPrice != null && line.unit_cost != null && Math.abs(line.unit_cost - savedPrice) > 0.001

  // Helper: update save-back data for this line (one field, partial)
  function patchSaveBack(patch: Partial<NonNullable<POLineInput['save_back_supplier_data']>>) {
    const current = line.save_back_supplier_data ?? {
      supplier_sku_code:  ref?.supplier_sku_code  ?? null,
      supplier_pack_size: ref?.supplier_pack_size ?? null,
      supplier_pack_unit: ref?.supplier_pack_unit ?? null,
      price:              ref?.price              ?? null,
    }
    onChange({ save_back_supplier_data: { ...current, ...patch } })
  }

  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="px-3 py-2">
        <select
          disabled={readOnly}
          value={line.line_type}
          onChange={(e) => onChange({ line_type: e.target.value as POLineInput['line_type'] })}
          className="w-full text-xs border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-50"
        >
          <option value="ingredient">Ingredient</option>
          <option value="packaging">Packaging</option>
          <option value="product">Product</option>
          <option value="other">Other</option>
        </select>
      </td>
      <td className="px-3 py-2">
        {line.line_type === 'ingredient' && (
          <select
            disabled={readOnly}
            value={line.ingredient_id ?? ''}
            onChange={(e) => onChange({ ingredient_id: e.target.value || null })}
            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
          >
            <option value="">— Select ingredient —</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>{i.name} · {i.sku_code}</option>
            ))}
          </select>
        )}
        {line.line_type === 'product' && (
          <select
            disabled={readOnly}
            value={line.product_id ?? ''}
            onChange={(e) => onChange({ product_id: e.target.value || null })}
            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
          >
            <option value="">— Select product —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.sku_code}</option>
            ))}
          </select>
        )}
        {line.line_type === 'packaging' && (
          <select
            disabled={readOnly}
            value={line.packaging_id ?? ''}
            onChange={(e) => onChange({ packaging_id: e.target.value || null })}
            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
          >
            <option value="">— Select packaging —</option>
            {packaging.map((pk) => (
              <option key={pk.id} value={pk.id}>{pk.name} · {pk.sku_code}</option>
            ))}
          </select>
        )}
        {line.line_type === 'other' && (
          <input
            disabled={readOnly}
            value={line.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Free-text description"
            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
          />
        )}
      </td>

      {/* SUPPLIER CODE */}
      <td className="px-3 py-2">
        <input
          disabled={codeDisabled}
          value={supCodeValue}
          onChange={(e) => setSupCode(e.target.value)}
          placeholder={isPurchased && !savedSupSku ? '—' : ''}
          className={`w-full text-xs border rounded px-1.5 py-1 ${isPurchased && !savedSupSku ? 'border-dashed border-gray-300 placeholder-gray-300' : 'border-gray-200'} disabled:bg-gray-50`}
        />
        {isPurchased && !readOnly && selectedId && supCodeValue !== (savedSupSku ?? '') && (
          <p className="text-[10px] text-blue-700 mt-0.5">will save to {isPackaging ? 'packaging' : 'ingredient'} on PO save</p>
        )}
      </td>

      {/* QTY */}
      <td className="px-3 py-2">
        <input
          disabled={readOnly}
          type="number"
          step="any"
          min={0}
          value={line.quantity_ordered || ''}
          onChange={(e) => onChange({ quantity_ordered: e.target.value === '' ? 0 : Number(e.target.value) })}
          className={`w-full text-right text-xs border rounded px-1.5 py-1 tabular-nums ${packMismatch ? 'border-amber-300 bg-amber-50' : 'border-gray-200'} disabled:bg-gray-50`}
        />
        {packMismatch && (
          <p className="text-[10px] text-amber-800 mt-0.5">
            ⚠ pack {packSize}{linePackUom ? ` ${linePackUom}` : ''}
            {' · '}
            <button type="button" className="underline" onClick={() => onChange({ quantity_ordered: suggestedQty! })}>round to {suggestedQty}</button>
          </p>
        )}
      </td>

      <td className="px-3 py-2">
        <input
          disabled={readOnly}
          value={line.unit_of_measure}
          onChange={(e) => onChange({ unit_of_measure: e.target.value })}
          className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
        />
      </td>

      {/* PACK SIZE */}
      <td className="px-3 py-2">
        <input
          disabled={codeDisabled}
          type="number"
          step="any"
          min={0}
          value={packSizeValue ?? ''}
          onChange={(e) => setPackSize(e.target.value === '' ? null : Number(e.target.value))}
          placeholder={isPurchased && savedPackSize == null ? '—' : ''}
          className={`w-full text-right text-xs border rounded px-1.5 py-1 tabular-nums ${isPurchased && savedPackSize == null ? 'border-dashed border-gray-300 placeholder-gray-300' : 'border-gray-200'} disabled:bg-gray-50`}
        />
        {isPurchased && !readOnly && selectedId && (packSizeValue ?? null) !== (savedPackSize ?? null) && (
          <p className="text-[10px] text-blue-700 mt-0.5">will save</p>
        )}
      </td>

      {/* UNIT PRICE */}
      <td className="px-3 py-2">
        <input
          disabled={readOnly}
          type="number"
          step="any"
          min={0}
          value={line.unit_cost ?? ''}
          onChange={(e) => onChange({ unit_cost: e.target.value === '' ? null : Number(e.target.value) })}
          className={`w-full text-right text-xs border rounded px-1.5 py-1 tabular-nums ${priceDrift ? 'border-amber-300 bg-amber-50' : 'border-gray-200'} disabled:bg-gray-50`}
        />
        {priceDrift && (
          <p className="text-[10px] text-amber-800 mt-0.5">
            ⚠ saved ${savedPrice!.toFixed(2)}
            {' · '}
            <button type="button" className="underline" onClick={() => patchSaveBack({ price: line.unit_cost })}>save ${line.unit_cost!.toFixed(2)} back</button>
          </p>
        )}
      </td>

      <td className="px-3 py-2 text-right tabular-nums">
        ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      {!readOnly && (
        <td className="px-3 py-2 text-center">
          {onRemove ? (
            <button onClick={onRemove} className="text-gray-400 hover:text-red-600">×</button>
          ) : null}
        </td>
      )}
    </tr>
  )
}
