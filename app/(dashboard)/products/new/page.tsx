import type { Metadata } from 'next'
import Link from 'next/link'
import { createProduct } from '../actions'
import { ProductForm } from '@/components/products/product-form'
import { getAppSettings } from '@/lib/settings'

export const metadata: Metadata = { title: 'New Product' }

interface PageProps {
  searchParams: { error?: string }
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'SKU Code and Product Name are required.',
  duplicate_sku:  'A product with that SKU Code already exists.',
  server:         'Something went wrong. Please try again.',
}

export default async function NewProductPage({ searchParams }: PageProps) {
  const settings = await getAppSettings()
  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? null) : null

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <Link href="/products" className="text-sm text-gray-500 hover:text-gray-900">
          ← Products / BOMs
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">New product</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create the product master record. You can add ingredients to the BOM after saving.
        </p>
      </div>

      <ProductForm action={createProduct} errorMessage={errorMessage} fxRate={Number(settings.fx_rate)} />
    </div>
  )
}
