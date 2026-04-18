import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateProduct } from '../../actions'
import { ProductForm } from '@/components/products/product-form'

export const metadata: Metadata = { title: 'Edit Product' }

interface PageProps {
  params: { id: string }
  searchParams: { error?: string }
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'SKU Code and Product Name are required.',
  duplicate_sku:  'A product with that SKU Code already exists.',
  server:         'Something went wrong. Please try again.',
}

export default async function EditProductPage({ params, searchParams }: PageProps) {
  const supabase = createClient()

  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!product) notFound()

  const errorMessage = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? null) : null

  const action = updateProduct.bind(null, params.id)

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href={`/products/${params.id}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {product.name}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">Edit product</h1>
      </div>

      <ProductForm product={product} action={action} errorMessage={errorMessage} />
    </div>
  )
}
