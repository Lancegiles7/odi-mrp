import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createIngredient } from '../actions'
import { IngredientForm } from '@/components/ingredients/ingredient-form'

export const metadata: Metadata = {
  title: 'Add Ingredient',
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'SKU Code and Ingredient Name are required.',
  duplicate_sku:  'An ingredient with this SKU Code already exists.',
  server:         'Something went wrong. Please try again.',
}

interface PageProps {
  searchParams: { error?: string; sku?: string; return_to?: string }
}

export default async function NewIngredientPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, code, name, contact_name, email, phone, country_of_origin, country_of_purchase, currency')
    .eq('is_active', true)
    .order('name', { ascending: true })

  const errorKey = searchParams.error
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? 'An error occurred.' : null

  // Only allow in-app return paths (defence against open redirects)
  const returnTo =
    searchParams.return_to && searchParams.return_to.startsWith('/')
      ? searchParams.return_to
      : null

  return (
    <div className="max-w-2xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/ingredients" className="hover:text-gray-900">Ingredients</Link>
        <span>/</span>
        <span className="text-gray-900">Add ingredient</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Add ingredient</h1>
        <p className="text-sm text-gray-500 mt-1">Add a new raw material to the system.</p>
        {returnTo && (
          <p className="text-xs text-gray-500 mt-2">
            You&apos;ll be returned to the product after saving.
          </p>
        )}
      </div>

      <IngredientForm
        action={createIngredient}
        suppliers={suppliers ?? []}
        errorMessage={errorMessage}
        returnTo={returnTo}
      />
    </div>
  )
}
