import { redirect } from 'next/navigation'

// BOMs have been merged into Products / BOMs. Preserve old bookmarks.
export default function BomsRedirect() {
  redirect('/products')
}
