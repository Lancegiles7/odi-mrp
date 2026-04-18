import type { Metadata } from 'next'
import Link from 'next/link'
import { createProduct } from '../actions'
import { ProductForm } from '@/components/products/product-form'

export const metadata: Metadata = { title: 'New Product' }

interface PageProps {
  searchParams: { error?: string }
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'SKU Code and Product Name are required.',
  duplicate_sku:  'A product with that SKU Code already exists.',
  server:         'Something went wrong. Please try again.',
}

export default function NewProductPage({ searchParams }: PageProps) {
  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? null) : null

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/products" className="text-sm text-gray-500 hover:text-gray-900">
          ← Products
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">New product</h1>
      </div>

      <ProductForm action={createProduct} errorMessage={errorMessage} />
    </div>
  )
}
