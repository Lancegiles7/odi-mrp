import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateIngredient } from '../../actions'
import { IngredientForm } from '@/components/ingredients/ingredient-form'
import { DeleteIngredientButton } from '@/components/ingredients/delete-ingredient-button'
import { ROLES } from '@/lib/constants'
import type { Ingredient } from '@/lib/types/database.types'
import { getAppSettings } from '@/lib/settings'

export const metadata: Metadata = {
  title: 'Edit Ingredient',
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'SKU Code and Ingredient Name are required.',
  duplicate_sku:  'An ingredient with this SKU Code already exists.',
  server:         'Something went wrong. Please try again.',
}

interface PageProps {
  params: { id: string }
  searchParams: { error?: string }
}

export default async function EditIngredientPage({ params, searchParams }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('user_profiles').select('roles(name)').eq('id', user?.id ?? '').maybeSingle() as { data: { roles: { name: string } | null } | null }
  const isAdmin = profile?.roles?.name === ROLES.ADMIN

  const [{ data: ingredient }, { data: suppliers }, settings] = await Promise.all([
    supabase
      .from('ingredients')
      .select('*')
      .eq('id', params.id)
      .single() as unknown as Promise<{ data: Ingredient | null }>,
    supabase
      .from('suppliers')
      .select('id, code, name, contact_name, email, phone, country_of_origin, country_of_purchase, currency')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    getAppSettings(),
  ])

  if (!ingredient) notFound()

  // List of active products whose active BOM references this ingredient,
  // so the Delete confirmation can show what's affected. Mirrors the
  // detail page; admin-only but cheap enough to always fetch.
  const { data: activeBomLinks } = await supabase
    .from('bom_items')
    .select('boms!inner(product_id, is_active)')
    .eq('ingredient_id', params.id)
    .eq('boms.is_active', true) as unknown as { data: Array<{ boms: { product_id: string; is_active: boolean } | null }> | null }

  const inUseProductIds = Array.from(new Set(
    (activeBomLinks ?? [])
      .map((r) => r.boms?.product_id)
      .filter((id): id is string => !!id),
  ))

  const { data: inUseProductRows } = inUseProductIds.length === 0
    ? { data: [] as Array<{ id: string; name: string }> }
    : await supabase
        .from('products')
        .select('id, name')
        .in('id', inUseProductIds)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name') as unknown as { data: Array<{ id: string; name: string }> | null }

  const inUseProducts = inUseProductRows ?? []

  const errorKey = searchParams.error
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? 'An error occurred.' : null

  const updateWithId = updateIngredient.bind(null, params.id)

  return (
    <div className="max-w-2xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/ingredients" className="hover:text-gray-900">Ingredients</Link>
        <span>/</span>
        <Link href={`/ingredients/${ingredient.id}`} className="hover:text-gray-900 truncate max-w-xs">
          {ingredient.name}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Edit</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Edit ingredient</h1>
          <p className="text-sm font-mono text-gray-400 mt-0.5">{ingredient.sku_code}</p>
        </div>
        {isAdmin && (
          <DeleteIngredientButton
            ingredientId={ingredient.id}
            ingredientName={ingredient.name}
            inUseProducts={inUseProducts}
          />
        )}
      </div>

      <IngredientForm
        ingredient={ingredient}
        suppliers={suppliers ?? []}
        action={updateWithId}
        errorMessage={errorMessage}
        fxRates={settings.fx_rates}
      />
    </div>
  )
}
