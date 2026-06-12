import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  ENHANCEMENT_CATEGORIES, ENHANCEMENT_CATEGORY_LABELS,
  ENHANCEMENT_PRIORITY_BY_VALUE, ENHANCEMENT_STATUS_BY_VALUE,
  ENHANCEMENT_STATUSES,
} from '@/lib/constants'
import { SubmitEnhancementButton } from '@/components/enhancements/submit-enhancement-button'
import { SortPicker, CategoryPicker } from '@/components/enhancements/filter-pickers'
import type { EnhancementStatus, EnhancementPriority, EnhancementCategory } from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Enhancements' }

interface PageProps {
  searchParams: { status?: string; category?: string; sort?: string }
}

interface EnhancementRow {
  id:             string
  title:          string
  description:    string
  category:       EnhancementCategory
  priority:       EnhancementPriority
  status:         EnhancementStatus
  status_note:    string | null
  built_url:      string | null
  submitted_at:   string
  updated_at:     string
  submitted_by:   string | null
  user_profiles:  { full_name: string | null } | null
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24)  return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7)    return `${days} day${days === 1 ? '' : 's'} ago`
  if (days < 30)   return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function EnhancementsPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const statusFilter   = (searchParams.status   ?? '').trim()
  const categoryFilter = (searchParams.category ?? '').trim()
  const sort           = (searchParams.sort     ?? 'newest').trim()

  let query = supabase
    .from('enhancements')
    .select(`
      id, title, description, category, priority, status, status_note, built_url,
      submitted_at, updated_at, submitted_by,
      user_profiles!enhancements_submitted_by_fkey ( full_name )
    `)
  if (statusFilter)   query = query.eq('status',   statusFilter)
  if (categoryFilter) query = query.eq('category', categoryFilter)

  if      (sort === 'priority') query = query.order('priority', { ascending: false })
  else if (sort === 'updated')  query = query.order('updated_at', { ascending: false })
  else                          query = query.order('submitted_at', { ascending: false })

  const { data: rows } = await query as unknown as { data: EnhancementRow[] | null }
  const items = rows ?? []

  // Comment counts (one extra query — small, sparse table).
  const ids = items.map((i) => i.id)
  const commentCounts = new Map<string, number>()
  if (ids.length > 0) {
    const { data: comments } = await supabase
      .from('enhancement_comments').select('enhancement_id').in('enhancement_id', ids) as
      unknown as { data: Array<{ enhancement_id: string }> | null }
    for (const c of comments ?? []) {
      commentCounts.set(c.enhancement_id, (commentCounts.get(c.enhancement_id) ?? 0) + 1)
    }
  }

  // Tile counts — across ALL statuses, regardless of current filter.
  const { data: tileRows } = await supabase
    .from('enhancements').select('status, status_changed_at') as
    unknown as { data: Array<{ status: EnhancementStatus; status_changed_at: string | null }> | null }
  let needsReview = 0, approved = 0, inProgress = 0, builtRecently = 0, totalOpen = 0
  const oneQuarterAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  for (const r of tileRows ?? []) {
    if (r.status === 'new')          needsReview++
    if (r.status === 'approved')     approved++
    if (r.status === 'in_progress')  inProgress++
    if (r.status === 'built' && r.status_changed_at && new Date(r.status_changed_at) > oneQuarterAgo) builtRecently++
    if (['new','under_review','approved','in_progress','on_hold'].includes(r.status)) totalOpen++
  }

  const pillBase = 'px-3 py-1.5 text-xs font-medium'
  const pillActive = (v: string) =>
    statusFilter === v
      ? 'bg-gray-900 text-white'
      : 'bg-white text-gray-700 hover:bg-gray-50'

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Enhancements</h1>
          <p className="text-sm text-gray-500 mt-1">Suggest improvements to the MRP system. Lance reviews and prioritises what gets built.</p>
        </div>
        <SubmitEnhancementButton />
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-5 gap-3">
        <Tile label="Needs review"        value={needsReview}        href="/enhancements?status=new"        accent="amber" />
        <Tile label="Approved"            value={approved}           href="/enhancements?status=approved" />
        <Tile label="In progress"         value={inProgress}         href="/enhancements?status=in_progress" accent="blue" />
        <Tile label="Built this quarter"  value={builtRecently}      href="/enhancements?status=built"     accent="emerald" />
        <Tile label="Total open"          value={totalOpen}          href="/enhancements" />
      </div>

      {/* Filter pills + sort */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
          <Link href="/enhancements" className={`${pillBase} ${pillActive('')}`}>All</Link>
          {ENHANCEMENT_STATUSES.map((s) => (
            <Link
              key={s.value}
              href={`/enhancements?status=${s.value}`}
              className={`${pillBase} border-l border-gray-300 ${pillActive(s.value)}`}
            >
              {s.short}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <SortPicker current={sort} statusFilter={statusFilter} categoryFilter={categoryFilter} />
          <CategoryPicker current={categoryFilter} statusFilter={statusFilter} sort={sort} />
        </div>
      </div>

      {/* Card list */}
      <div className="space-y-2">
        {items.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">
            No enhancements match these filters. Click <span className="font-semibold">+ Submit enhancement</span> to add the first one.
          </div>
        )}
        {items.map((item) => {
          const status   = ENHANCEMENT_STATUS_BY_VALUE.get(item.status)
          const priority = ENHANCEMENT_PRIORITY_BY_VALUE.get(item.priority)
          const comments = commentCounts.get(item.id) ?? 0
          const rowBg =
            item.status === 'new'         ? 'border-amber-200 bg-amber-50/40' :
            item.status === 'in_progress' ? 'border-blue-200 bg-blue-50/40'   :
            item.status === 'declined'    ? 'opacity-60 border-gray-200'      :
                                            'border-gray-200'
          return (
            <Link
              key={item.id}
              href={`/enhancements/${item.id}`}
              className={`block border rounded-md p-4 hover:bg-gray-50 transition-colors ${rowBg}`}
            >
              <div className="flex items-start gap-3 flex-wrap mb-1">
                {status   && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${status.chip}`}>{status.short}</span>}
                {priority && item.priority !== 'medium' && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider ${priority.chip}`}>
                    {priority.label} priority
                  </span>
                )}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium uppercase tracking-wider">
                  {ENHANCEMENT_CATEGORY_LABELS[item.category] ?? item.category}
                </span>
              </div>
              <div className="font-semibold text-sm">{item.title}</div>
              <p className="text-xs text-gray-600 mt-1 line-clamp-2 whitespace-pre-line">{item.description}</p>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500 flex-wrap">
                <span>{item.user_profiles?.full_name ?? 'Unknown'} · {timeAgo(item.submitted_at)}</span>
                {comments > 0 && <><span>·</span><span>💬 {comments} comment{comments === 1 ? '' : 's'}</span></>}
                {item.status === 'built' && item.built_url && (
                  <>
                    <span>·</span>
                    <span className="text-emerald-700 font-medium">→ Try it: {item.built_url}</span>
                  </>
                )}
                {item.status_note && item.status !== 'built' && (
                  <>
                    <span>·</span>
                    <span className="italic">&ldquo;{item.status_note}&rdquo;</span>
                  </>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function Tile({ label, value, href, accent }: { label: string; value: number; href: string; accent?: 'amber' | 'emerald' | 'blue' }) {
  const cls =
    accent === 'amber'   ? 'bg-amber-50 border-amber-200'     :
    accent === 'emerald' ? 'bg-emerald-50 border-emerald-200' :
    accent === 'blue'    ? 'bg-blue-50 border-blue-200'       :
                           'bg-white border-gray-200'
  const labelCls =
    accent === 'amber'   ? 'text-amber-800'   :
    accent === 'emerald' ? 'text-emerald-800' :
    accent === 'blue'    ? 'text-blue-700'    :
                           'text-gray-500'
  const valCls =
    accent === 'amber'   ? 'text-amber-900'   :
    accent === 'emerald' ? 'text-emerald-900' :
    accent === 'blue'    ? 'text-blue-900'    :
                           'text-gray-900'
  return (
    <Link href={href} className={`p-3 border rounded-md hover:opacity-90 transition-opacity ${cls}`}>
      <div className={`text-[11px] uppercase font-semibold ${labelCls}`}>{label}</div>
      <div className={`text-lg font-semibold ${valCls}`}>{value}</div>
    </Link>
  )
}

