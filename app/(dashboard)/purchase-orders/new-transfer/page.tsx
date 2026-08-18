import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { generatePoNumber } from '@/app/(dashboard)/purchase-orders/actions'
import { loadSrtByProduct } from '@/lib/transfer-orders'
import { TransferForm, type SiteOption, type ProductOption } from '@/components/purchase-orders/transfer-form'

export const metadata: Metadata = { title: 'New transfer order' }
export const dynamic = 'force-dynamic'

export default async function NewTransferOrderPage() {
  const supabase = createClient()

  const [{ data: sites }, { data: products }] = await Promise.all([
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
      initialPickupDate={null}
      initialExpectedDate={null}
      initialTransportProvider={null}
      initialNotes={null}
      initialLines={[]}
      sites={sites ?? []}
      products={products ?? []}
      srtByProduct={srtByProduct}
    />
  )
}
