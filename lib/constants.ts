/**
 * Application-wide constants.
 * Keep these in sync with the CHECK constraints in 001_initial_schema.sql.
 */

// ============================================================
// ROLES
// ============================================================
export const ROLES = {
  ADMIN:        'admin',
  OPERATIONS:   'operations',
  SUPPLY_CHAIN: 'supply_chain',
  FINANCE:      'finance',
  READ_ONLY:    'read_only',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

// Which roles can write (used for UI permission checks)
export const WRITE_ROLES: RoleName[] = [
  ROLES.ADMIN,
  ROLES.OPERATIONS,
  ROLES.SUPPLY_CHAIN,
  ROLES.FINANCE,
]


// ============================================================
// PURCHASE ORDER STATUS
// ============================================================
export const PO_STATUS = {
  DRAFT:              'draft',
  SUBMITTED:          'submitted',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED:           'received',
  CANCELLED:          'cancelled',
} as const

export const PO_STATUS_LABELS: Record<string, string> = {
  draft:              'Draft',
  submitted:          'Submitted',
  partially_received: 'Partially Received',
  received:           'Received',
  cancelled:          'Cancelled',
}

export const PO_STATUS_COLOURS: Record<string, string> = {
  draft:              'bg-gray-100 text-gray-700',
  submitted:          'bg-blue-100 text-blue-700',
  partially_received: 'bg-amber-100 text-amber-700',
  received:           'bg-green-100 text-green-700',
  cancelled:          'bg-red-100 text-red-700',
}

// ============================================================
// PAYMENT TERMS
// Stored as a code (e.g. 'NET_30') so the future cash-flow model
// can compute payment dates programmatically. Free-text "Other"
// values are stored as-is alongside the known codes.
// ============================================================
export const PAYMENT_TERMS = [
  { code: 'PUF',    label: 'Payment up front (PUF)' },
  { code: 'COD',    label: 'Payment before delivery (COD)' },
  { code: 'NET_14', label: '14 days' },
  { code: 'NET_30', label: '30 days' },
  { code: 'NET_60', label: '60 days' },
  { code: 'EOM_20', label: '20 days EOM' },
  { code: 'EOM_30', label: '30 days EOM' },
] as const

export type PaymentTermsCode = (typeof PAYMENT_TERMS)[number]['code']

const KNOWN_CODES = new Set(PAYMENT_TERMS.map((p) => p.code))

/** Render a stored payment_terms value for display. */
export function paymentTermsLabel(value: string | null | undefined): string {
  if (!value) return '—'
  const t = PAYMENT_TERMS.find((p) => p.code === value)
  return t ? t.label : value   // unknown codes / custom strings render as-is
}

/** True when the value is one of the canonical codes. */
export function isKnownPaymentTermsCode(value: string | null | undefined): boolean {
  return !!value && KNOWN_CODES.has(value as PaymentTermsCode)
}


// ============================================================
// PACKAGING
// ============================================================
export const PACKAGING_TYPES = [
  { code: 'FLOW_WRAP',    label: 'Flow wrap' },
  { code: 'BOX',          label: 'Box' },
  { code: 'POUCH_SNACKS', label: 'Pouch — snacks' },
  { code: 'POUCH',        label: 'Pouch' },
  { code: 'SACHET',       label: 'Sachet' },
  { code: 'TUB',          label: 'Tub' },
  { code: 'SRT',          label: 'SRT' },
] as const

export type PackagingTypeCode = (typeof PACKAGING_TYPES)[number]['code'] | 'OTHER'

const PACKAGING_TYPE_KNOWN = new Set(PACKAGING_TYPES.map((p) => p.code))

export function packagingTypeLabel(code: string | null | undefined): string {
  if (!code) return '—'
  if (code === 'OTHER') return 'Other'
  const t = PACKAGING_TYPES.find((p) => p.code === code)
  return t ? t.label : code
}

export function isKnownPackagingType(code: string | null | undefined): boolean {
  return !!code && (code === 'OTHER' || PACKAGING_TYPE_KNOWN.has(code as Exclude<PackagingTypeCode, 'OTHER'>))
}

export const PACKAGING_TYPE_COLOURS: Record<string, string> = {
  FLOW_WRAP:    'bg-blue-100 text-blue-700',
  BOX:          'bg-emerald-100 text-emerald-700',
  POUCH_SNACKS: 'bg-purple-100 text-purple-700',
  POUCH:        'bg-amber-100 text-amber-700',
  SACHET:       'bg-teal-100 text-teal-700',
  TUB:          'bg-orange-100 text-orange-700',
  SRT:          'bg-rose-100 text-rose-700',
  OTHER:        'bg-gray-100 text-gray-700',
}

export const SUPPORTED_CURRENCIES = ['NZD', 'AUD', 'USD', 'EUR', 'GBP'] as const
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]


// ============================================================
// STOCK MOVEMENT TYPES
// ============================================================
export const MOVEMENT_TYPE = {
  PURCHASE_RECEIVED:   'purchase_received',
  PRODUCTION_CONSUMED: 'production_consumed',
  OPENING_BALANCE:     'opening_balance',
  ADJUSTMENT:          'adjustment',
  WASTAGE:             'wastage',
  CORRECTION:          'correction',
  TRANSFER_IN:         'transfer_in',
  TRANSFER_OUT:        'transfer_out',
} as const

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase_received:   'Purchase Received',
  production_consumed: 'Production Consumed',
  opening_balance:     'Opening Balance',
  adjustment:          'Stock Adjustment',
  wastage:             'Wastage',
  correction:          'Manual Correction',
  transfer_in:         'Transfer In',
  transfer_out:        'Transfer Out',
}

// Positive movement types (stock in)
export const INBOUND_MOVEMENT_TYPES = [
  MOVEMENT_TYPE.PURCHASE_RECEIVED,
  MOVEMENT_TYPE.OPENING_BALANCE,
  MOVEMENT_TYPE.TRANSFER_IN,
] as const

// Negative movement types (stock out)
export const OUTBOUND_MOVEMENT_TYPES = [
  MOVEMENT_TYPE.PRODUCTION_CONSUMED,
  MOVEMENT_TYPE.WASTAGE,
  MOVEMENT_TYPE.TRANSFER_OUT,
] as const


// ============================================================
// UNITS OF MEASURE
// ============================================================
export const UNITS_OF_MEASURE = [
  { value: 'kg',     label: 'Kilograms (kg)' },
  { value: 'g',      label: 'Grams (g)' },
  { value: 'L',      label: 'Litres (L)' },
  { value: 'mL',     label: 'Millilitres (mL)' },
  { value: 'each',   label: 'Each' },
  { value: 'case',   label: 'Case' },
  { value: 'box',    label: 'Box' },
  { value: 'bag',    label: 'Bag' },
  { value: 'pallet', label: 'Pallet' },
  { value: 'unit',   label: 'Unit' },
] as const

export const UNIT_VALUES = UNITS_OF_MEASURE.map((u) => u.value)


// ============================================================
// NAVIGATION
// ============================================================
export const NAV_GROUPS = [
  {
    label: null,
    items: [
      { name: 'Dashboard', href: '/' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { name: 'Products / BOMs', href: '/products' },
      { name: 'Ingredients',     href: '/ingredients' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { name: 'Suppliers',        href: '/suppliers' },
      { name: 'Purchase Orders',  href: '/purchase-orders' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { name: 'Stock Levels',     href: '/inventory' },
      { name: 'Stock Movements',  href: '/stock-movements' },
    ],
  },
] as const

export const ADMIN_NAV_GROUP = {
  label: 'Admin',
  items: [
    { name: 'Settings', href: '/settings' },
    { name: 'Users',    href: '/users' },
  ],
} as const


// ============================================================
// PRODUCT GROUPS (enum + display order)
// ============================================================
export const PRODUCT_GROUPS = [
  { value: 'pouches',     label: 'Pouches' },
  { value: 'snacks_4bs',  label: "Snacks (4B's)" },
  { value: 'puffs_melts', label: 'Puffs & Melts' },
  { value: 'tubs',        label: 'Tubs' },
  { value: 'sachets',     label: 'Sachets' },
  { value: 'noodles',     label: 'Noodles' },
  { value: 'vitamin_d',   label: 'Vitamin D' },
] as const

export const PRODUCT_GROUP_LABELS: Record<string, string> = Object.fromEntries(
  PRODUCT_GROUPS.map((g) => [g.value, g.label])
)


// ============================================================
// PAGINATION
// ============================================================
export const DEFAULT_PAGE_SIZE = 50


// ============================================================
// SOFT DELETE
// Days a soft-deleted product stays in the trash before it's
// automatically purged.
// ============================================================
export const SOFT_DELETE_WINDOW_DAYS = 30


// ============================================================
// DEMAND CHANNELS (order = display order on the demand page)
//
// As of migration 032, pipefill is split per country.
// 'pipefill' → 'pipefill_nz' (existing data); 'pipefill_au' added.
// Country is encoded as a separate field so callers can group /
// subtotal without parsing the channel name.
// ============================================================
export type ChannelCountry = 'NZ' | 'AUS'

export const DEMAND_CHANNELS = [
  { value: 'ecomm_nz',    label: 'Ecomm NZ',    country: 'NZ'  as const, isPipefill: false },
  { value: 'retail_nz',   label: 'Retail NZ',   country: 'NZ'  as const, isPipefill: false },
  { value: 'pipefill_nz', label: 'Pipefill NZ', country: 'NZ'  as const, isPipefill: true  },
  { value: 'ecomm_au',    label: 'Ecomm AUS',   country: 'AUS' as const, isPipefill: false },
  { value: 'retail_au',   label: 'Retail AUS',  country: 'AUS' as const, isPipefill: false },
  { value: 'pipefill_au', label: 'Pipefill AUS',country: 'AUS' as const, isPipefill: true  },
] as const

export const DEMAND_CHANNEL_LABELS: Record<string, string> = Object.fromEntries(
  DEMAND_CHANNELS.map((c) => [c.value, c.label])
)

export const NZ_CHANNELS  = DEMAND_CHANNELS.filter((c) => c.country === 'NZ').map((c) => c.value)
export const AUS_CHANNELS = DEMAND_CHANNELS.filter((c) => c.country === 'AUS').map((c) => c.value)
export const NZ_CHANNEL_SET  = new Set<string>(NZ_CHANNELS)
export const AUS_CHANNEL_SET = new Set<string>(AUS_CHANNELS)

export function channelCountry(ch: string): ChannelCountry | null {
  if (NZ_CHANNEL_SET.has(ch))  return 'NZ'
  if (AUS_CHANNEL_SET.has(ch)) return 'AUS'
  return null
}


// ============================================================
// INGREDIENT — certifications + document types
// (locked-in lists driven by check constraints in DB)
// ============================================================
export const INGREDIENT_CERTIFICATIONS = [
  { value: 'gfsi',       label: 'GFSI',       short: 'GFSI',  chip: 'bg-emerald-100 text-emerald-800' },
  { value: 'haccp',      label: 'HACCP',      short: 'HACCP', chip: 'bg-amber-100 text-amber-800'     },
  { value: 'brc',        label: 'BRC',        short: 'BRC',   chip: 'bg-blue-100 text-blue-800'       },
  { value: 'iso_22000',  label: 'ISO 22000',  short: 'ISO',   chip: 'bg-indigo-100 text-indigo-800'   },
  { value: 'fssc_22000', label: 'FSSC 22000', short: 'FSSC',  chip: 'bg-purple-100 text-purple-800'   },
] as const

export const INGREDIENT_CERTIFICATION_LABELS: Record<string, string> = Object.fromEntries(
  INGREDIENT_CERTIFICATIONS.map((c) => [c.value, c.label]),
)

export const INGREDIENT_DOC_TYPES = [
  { value: 'coa',       label: 'COA',           long: 'Certificate of Analysis', chip: 'bg-purple-100 text-purple-800' },
  { value: 'spec',      label: 'Spec sheet',    long: 'Spec sheet',              chip: 'bg-blue-100 text-blue-800'     },
  { value: 'allergen',  label: 'Allergen',      long: 'Allergen statement',      chip: 'bg-amber-100 text-amber-800'   },
  { value: 'nutrition', label: 'Nutrition',     long: 'Nutritional info',        chip: 'bg-pink-100 text-pink-800'     },
  { value: 'cert',      label: 'Certification', long: 'Certification certificate', chip: 'bg-emerald-100 text-emerald-800' },
  { value: 'pricing',   label: 'Pricing',       long: 'Pricing / quote',         chip: 'bg-indigo-100 text-indigo-800' },
  { value: 'other',     label: 'Other',         long: 'Other',                   chip: 'bg-gray-100 text-gray-700'     },
] as const

export const INGREDIENT_DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  INGREDIENT_DOC_TYPES.map((t) => [t.value, t.label]),
)

export const INGREDIENT_STATUSES = [
  { value: 'confirmed', label: 'Confirmed', chip: 'bg-emerald-100 text-emerald-800' },
  { value: 'at_risk',   label: 'At risk',   chip: 'bg-amber-100 text-amber-800'     },
  { value: 'pending',   label: 'Pending',   chip: 'bg-gray-100 text-gray-600'       },
  { value: 'inactive',  label: 'Inactive',  chip: 'bg-gray-200 text-gray-500'       },
] as const

// Ingredient category — directly purchased vs supplied by a contract
// manufacturer. Snack ingredients are priced in AUD. Add new buckets here
// (and to the DB CHECK in migration 039) as other manufacturer groups appear.
export const INGREDIENT_CATEGORIES = [
  { value: 'purchased', label: 'Purchased', chip: 'bg-gray-100 text-gray-600'  },
  { value: 'snack',     label: 'Snack',     chip: 'bg-amber-100 text-amber-800' },
] as const

export const INGREDIENT_CATEGORY_LABELS: Record<string, string> =
  Object.fromEntries(INGREDIENT_CATEGORIES.map((c) => [c.value, c.label]))


// ============================================================
// ENHANCEMENT LOG — categories, priorities, statuses
// ============================================================
export const ENHANCEMENT_CATEGORIES = [
  { value: 'demand',          label: 'Demand'           },
  { value: 'production',      label: 'Production'       },
  { value: 'ingredients',     label: 'Ingredients'      },
  { value: 'packaging',       label: 'Packaging'        },
  { value: 'purchase_orders', label: 'Purchase orders'  },
  { value: 'inventory',       label: 'Inventory'        },
  { value: 'reporting',       label: 'Reporting'        },
  { value: 'settings',        label: 'Settings / Admin' },
  { value: 'other',           label: 'Other'            },
] as const

export const ENHANCEMENT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ENHANCEMENT_CATEGORIES.map((c) => [c.value, c.label]),
)

export const ENHANCEMENT_PRIORITIES = [
  { value: 'low',     label: 'Low',     hint: 'Nice-to-have',   chip: 'bg-gray-100 text-gray-700'   },
  { value: 'medium',  label: 'Medium',  hint: 'Would help',     chip: 'bg-amber-100 text-amber-800' },
  { value: 'high',    label: 'High',    hint: 'Slowing me down', chip: 'bg-rose-100 text-rose-800'  },
  { value: 'urgent',  label: 'Urgent',  hint: 'Blocking me',    chip: 'bg-red-100 text-red-800'     },
] as const

export const ENHANCEMENT_STATUSES = [
  { value: 'new',          label: 'New · awaiting review',  short: 'New',          chip: 'bg-amber-100 text-amber-800'   },
  { value: 'under_review', label: 'Under review',           short: 'Under review', chip: 'bg-gray-100 text-gray-700'     },
  { value: 'approved',     label: 'Approved',               short: 'Approved',     chip: 'bg-emerald-100 text-emerald-800' },
  { value: 'in_progress',  label: 'In progress',            short: 'In progress',  chip: 'bg-blue-100 text-blue-800'     },
  { value: 'built',        label: 'Built',                  short: '✓ Built',     chip: 'bg-emerald-100 text-emerald-800' },
  { value: 'declined',     label: 'Declined',               short: 'Declined',     chip: 'bg-gray-200 text-gray-600'     },
  { value: 'on_hold',      label: 'On hold',                short: 'On hold',      chip: 'bg-gray-100 text-gray-700'     },
] as const

export const ENHANCEMENT_STATUS_BY_VALUE = new Map(ENHANCEMENT_STATUSES.map((s) => [s.value, s]))
export const ENHANCEMENT_PRIORITY_BY_VALUE = new Map(ENHANCEMENT_PRIORITIES.map((p) => [p.value, p]))


// ============================================================
// MANUFACTURERS (suggested list — products.manufacturer is free text)
// ============================================================
export const MANUFACTURERS = [
  'Brand Nation',
  'I Eat Fresh',
  'Flavour Makers',
] as const

// Colour chips for the production page "view all" table
export const MANUFACTURER_CHIP_COLOURS: Record<string, string> = {
  'Brand Nation':   'bg-indigo-50 text-indigo-700',
  'I Eat Fresh':    'bg-emerald-50 text-emerald-700',
  'Flavour Makers': 'bg-sky-50 text-sky-700',
}


// ============================================================
// PLANNING HORIZON — rolling N months on Demand + Production
// ============================================================
export const PLANNING_MONTHS = 12
