import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { generatePoNumber } from '@/app/(dashboard)/purchase-orders/actions'
import { loadSrtByProduct } from '@/lib/transfer-orders'
import { TransferForm, type SiteOption, type ProductOption, type PackagingOption, type IngredientOption } from '@/components/purchase-orders/transfer-form'
import { PROCURED_INGREDIENT_CATEGORY } from '@/lib/constants'

export const metadata: Metadata = { title: 'New transfer order' }
export const dynamic = 'force-dynamic'

export default async function NewTransferOrderPage() {
  const supabase = createClient()

  const [{ data: sites }, { data: products }, { data: packaging }, { data: ingredients }] = await Promise.all([
    supabase.from('suppliers')
      .select('id, name, site_type, address')
      .not('site_type', 'is', null)
      .eq('is_active', true)
      .order('site_type').order('name') as unknown as Promise<{ data: SiteOption[] | null }>,
    supabase.from('products')
      .select('id, sku_code, name, product_type')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name') as unknown as Promise<{ data: ProductOption[] | null }>,
    supabase.from('packaging')
      .select('id, sku_code, name')
      .eq('is_active', true)
      .order('name') as unknown as Promise<{ data: PackagingOption[] | null }>,
    supabase.from('ingredients')
      .select('id, sku_code, name, unit_of_measure')
      .eq('is_active', true)
      .eq('category', PROCURED_INGREDIENT_CATEGORY)
      .order('name') as unknown as Promise<{ data: IngredientOption[] | null }>,
  ])

  const poNumber = await generatePoNumber('transfer')
  const srtByProduct = await loadSrtByProduct()

  return (
    <TransferForm
      mode="new"
      initialPoNumber={poNumber}
      initialFromId=""
      initialToId=""
      initialMarket="NZ"
      initialStockMove={null}
      initialPickupDate={null}
      initialExpectedDate={null}
      initialTransportProvider={null}
      initialNotes={null}
      initialLines={[]}
      initialPkgLines={[]}
      initialIngLines={[]}
      initialOtherLines={[]}
      sites={sites ?? []}
      products={products ?? []}
      packaging={packaging ?? []}
      ingredients={ingredients ?? []}
      srtByProduct={srtByProduct}
    />
  )
}
