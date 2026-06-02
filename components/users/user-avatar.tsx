/**
 * Initials avatar. Pure presentational; colour is chosen by the caller
 * (typically based on role) so the avatar stays consistent between
 * the users list and the edit page.
 */
type Colour = 'purple' | 'blue' | 'emerald' | 'amber' | 'gray'

const CLASSES: Record<Colour, string> = {
  purple:  'bg-purple-100 text-purple-700',
  blue:    'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber:   'bg-amber-100 text-amber-700',
  gray:    'bg-gray-200 text-gray-600',
}

const SIZES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-12 h-12 text-sm',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function UserAvatar({
  name, colour = 'gray', size = 'sm',
}: { name: string; colour?: Colour; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`rounded-full inline-flex items-center justify-center font-semibold flex-shrink-0 ${CLASSES[colour]} ${SIZES[size]}`}>
      {initials(name)}
    </span>
  )
}
