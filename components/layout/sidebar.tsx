'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  FlaskConical,
  Truck,
  ShoppingCart,
  Warehouse,
  ArrowLeftRight,
  Users,
  Settings as SettingsIcon,
  Trash2,
  TrendingUp,
  Factory,
  Leaf,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROLES } from '@/lib/constants'

const ICON_MAP = {
  '/':                LayoutDashboard,
  '/demand':          TrendingUp,
  '/production':      Factory,
  '/products':        Package,
  '/products/trash':  Trash2,
  '/ingredients':     FlaskConical,
  '/ingredients/demand': Leaf,
  '/suppliers':       Truck,
  '/purchase-orders': ShoppingCart,
  '/inventory':       Warehouse,
  '/stock-movements': ArrowLeftRight,
  '/settings':        SettingsIcon,
  '/users':           Users,
} as const

const NAV_GROUPS = [
  {
    label: null,
    items: [{ name: 'Dashboard', href: '/' }],
  },
  {
    label: 'Planning',
    items: [
      { name: 'Demand',             href: '/demand' },
      { name: 'Production',         href: '/production' },
      { name: 'Ingredient demand',  href: '/ingredients/demand' },
      { name: 'Products / BOMs',    href: '/products' },
      { name: 'Ingredients',        href: '/ingredients' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { name: 'Suppliers',       href: '/suppliers' },
      { name: 'Purchase Orders', href: '/purchase-orders' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { name: 'Stock Levels',    href: '/inventory' },
      { name: 'Stock Movements', href: '/stock-movements' },
    ],
  },
]

const ADMIN_GROUP = {
  label: 'Admin',
  items: [
    { name: 'Settings',       href: '/settings' },
    { name: 'Product trash',  href: '/products/trash' },
    { name: 'Users',          href: '/users' },
  ],
}

interface SidebarProps {
  userRole: string | null
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname()

  const groups =
    userRole === ROLES.ADMIN
      ? [...NAV_GROUPS, ADMIN_GROUP]
      : NAV_GROUPS

  // Pick the single nav item whose href is the longest prefix of the
  // current path — avoids "/ingredients" lighting up on "/ingredients/demand".
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href))
  const activeHref = allHrefs
    .filter((h) => (h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(h + '/')))
    .sort((a, b) => b.length - a.length)[0] ?? null

  const isActive = (href: string) => href === activeHref

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="h-14 flex items-center gap-2.5 px-5 border-b border-gray-200 flex-shrink-0">
        <div className="h-7 w-7 rounded-md bg-gray-900 flex items-center justify-center">
          <span className="text-white text-xs font-bold">O</span>
        </div>
        <span className="text-sm font-semibold text-gray-900 tracking-tight">
          Odi MRP
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin">
        {groups.map((group, idx) => (
          <div key={idx} className={idx > 0 ? 'mt-5' : ''}>
            {group.label && (
              <p className="px-3 mb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICON_MAP[item.href as keyof typeof ICON_MAP]
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                        active
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      {Icon && (
                        <Icon
                          className={cn(
                            'h-4 w-4 flex-shrink-0',
                            active ? 'text-white' : 'text-gray-400'
                          )}
                        />
                      )}
                      {item.name}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
