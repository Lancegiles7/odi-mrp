import type { Metadata } from 'next'
import Link from 'next/link'
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
  searchParams: { error?: string; sku?: string }
}

export default function NewIngredientPage({ searchParams }: PageProps) {
  const errorKey = searchParams.error
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? 'An error occurred.' : null

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/ingredients" className="hover:text-gray-900">
          Ingredients
        </Link>
        <span>/</span>
        <span className="text-gray-900">Add ingredient</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Add ingredient</h1>
        <p className="text-sm text-gray-500 mt-1">
          Add a new raw material to the system.
        </p>
      </div>

      <IngredientForm action={createIngredient} errorMessage={errorMessage} />
    </div>
  )
}
