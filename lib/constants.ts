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
      { name: 'Products',          href: '/products' },
      { name: 'Ingredients',       href: '/ingredients' },
      { name: 'Bills of Materials', href: '/boms' },
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
    { name: 'Users',    href: '/users' },
  ],
} as const


// ============================================================
// PAGINATION
// ============================================================
export const DEFAULT_PAGE_SIZE = 50
