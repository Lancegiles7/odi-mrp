import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateIngredient } from '../../actions'
import { IngredientForm } from '@/components/ingredients/ingredient-form'
import type { Ingredient } from '@/lib/types/database.types'

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

  const [{ data: ingredient }, { data: suppliers }] = await Promise.all([
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
  ])

  if (!ingredient) notFound()

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

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Edit ingredient</h1>
        <p className="text-sm font-mono text-gray-400 mt-0.5">{ingredient.sku_code}</p>
      </div>

      <IngredientForm
        ingredient={ingredient}
        suppliers={suppliers ?? []}
        action={updateWithId}
        errorMessage={errorMessage}
      />
    </div>
  )
}
