import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  ROLES,
  ENHANCEMENT_CATEGORY_LABELS,
  ENHANCEMENT_PRIORITY_BY_VALUE,
  ENHANCEMENT_STATUS_BY_VALUE,
} from '@/lib/constants'
import { CommentForm } from '@/components/enhancements/comment-form'
import { AdminStatusPanel } from '@/components/enhancements/admin-status-panel'
import type { EnhancementStatus, EnhancementPriority, EnhancementCategory } from '@/lib/types/database.types'

export const metadata: Metadata = { title: 'Enhancement' }

interface PageProps {
  params: { id: string }
}

interface EnhancementRow {
  id:               string
  title:            string
  description:      string
  category:         EnhancementCategory
  priority:         EnhancementPriority
  status:           EnhancementStatus
  status_note:      string | null
  status_changed_at:string | null
  built_url:        string | null
  submitted_at:     string
  submitted_by:     string | null
  user_profiles:    { full_name: string | null } | null
}

interface CommentRow {
  id:             string
  body:           string
  created_at:     string
  author_id:      string | null
  user_profiles:  { full_name: string | null; role_id: string | null } | null
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-NZ', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default async function EnhancementDetailPage({ params }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('user_profiles').select('id, roles(name)').eq('id', user.id).maybeSingle() as
    { data: { id: string; roles: { name: string } | null } | null }
  const isAdmin = me?.roles?.name === ROLES.ADMIN

  const [{ data: row }, { data: comments }, { data: statusChangedByRow }] = await Promise.all([
    supabase
      .from('enhancements')
      .select(`
        id, title, description, category, priority, status, status_note, status_changed_at,
        built_url, submitted_at, submitted_by, status_changed_by,
        user_profiles!enhancements_submitted_by_fkey ( full_name )
      `)
      .eq('id', params.id)
      .maybeSingle() as unknown as Promise<{ data: (EnhancementRow & { status_changed_by: string | null }) | null }>,
    supabase
      .from('enhancement_comments')
      .select(`
        id, body, created_at, author_id,
        user_profiles!enhancement_comments_author_id_fkey ( full_name, role_id )
      `)
      .eq('enhancement_id', params.id)
      .order('created_at') as unknown as Promise<{ data: CommentRow[] | null }>,
    supabase
      .from('enhancements')
      .select('status_changed_by, user_profiles!enhancements_status_changed_by_fkey ( full_name )')
      .eq('id', params.id)
      .maybeSingle() as unknown as Promise<{ data: { status_changed_by: string | null; user_profiles: { full_name: string | null } | null } | null }>,
  ])

  if (!row) notFound()

  const status   = ENHANCEMENT_STATUS_BY_VALUE.get(row.status)
  const priority = ENHANCEMENT_PRIORITY_BY_VALUE.get(row.priority)

  // Quick admin lookup for highlighting admin comments. RLS lets us read
  // user_profiles.roles, but joining roles for every comment is overkill —
  // a single fetch of admin profile IDs is plenty.
  const { data: admins } = await supabase
    .from('user_profiles').select('id, roles!inner(name)').eq('roles.name', 'admin') as
    unknown as { data: Array<{ id: string }> | null }
  const adminIds = new Set((admins ?? []).map((a) => a.id))

  return (
    <div className="max-w-5xl space-y-5">
      <Link href="/enhancements" className="text-sm text-gray-500 hover:underline">← Enhancements</Link>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {status && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${status.chip}`}>{status.label}</span>}
          {priority && row.priority !== 'medium' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider ${priority.chip}`}>
              {priority.label} priority
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium uppercase tracking-wider">
            {ENHANCEMENT_CATEGORY_LABELS[row.category] ?? row.category}
          </span>
        </div>
        <h1 className="text-xl font-semibold">{row.title}</h1>
        <div className="text-xs text-gray-500 mt-1">
          Submitted by <span className="font-medium text-gray-700">{row.user_profiles?.full_name ?? 'Unknown'}</span> · {fmtWhen(row.submitted_at)}
        </div>
        {row.status_note && (
          <div className="mt-3 p-3 bg-amber-50 border-l-4 border-amber-300 text-sm text-amber-900">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 mb-0.5">
              Admin note{statusChangedByRow?.user_profiles?.full_name ? ` · ${statusChangedByRow.user_profiles.full_name}` : ''}
            </div>
            {row.status_note}
          </div>
        )}
        {row.status === 'built' && row.built_url && (
          <div className="mt-3">
            <Link href={row.built_url} className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-md hover:bg-emerald-200">
              → Try it on {row.built_url}
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Left + middle — description + comments */}
        <div className="col-span-2 space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">Description</div>
            <div className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{row.description}</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-3">
              Comments {(comments?.length ?? 0) > 0 && `(${comments!.length})`}
            </div>
            <div className="space-y-3 mb-4">
              {(comments ?? []).length === 0 && (
                <div className="text-xs text-gray-400 italic">No comments yet — be the first to reply.</div>
              )}
              {(comments ?? []).map((c) => {
                const isAdminAuthor = c.author_id && adminIds.has(c.author_id)
                return (
                  <div
                    key={c.id}
                    className={`rounded p-3 text-sm ${isAdminAuthor ? 'bg-emerald-50/60 border border-emerald-200' : 'bg-gray-50'}`}
                  >
                    <div className={`text-xs mb-1 ${isAdminAuthor ? 'text-emerald-700' : 'text-gray-500'}`}>
                      <span className="font-medium">
                        {c.user_profiles?.full_name ?? 'Unknown'}
                        {isAdminAuthor && <span className="ml-1 text-[10px] uppercase tracking-wider">(admin)</span>}
                      </span>
                      <span> · {fmtWhen(c.created_at)}</span>
                    </div>
                    <div className="whitespace-pre-line text-gray-800">{c.body}</div>
                  </div>
                )
              })}
            </div>

            <CommentForm enhancementId={row.id} />
          </div>
        </div>

        {/* Right — admin panel + activity */}
        <div className="space-y-4">
          {isAdmin && (
            <AdminStatusPanel
              enhancementId={row.id}
              initialStatus={row.status}
              initialNote={row.status_note}
              initialBuiltUrl={row.built_url}
            />
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">Activity</div>
            <ul className="space-y-2 text-xs text-gray-600">
              <li>
                <span className="font-medium text-gray-800">{row.user_profiles?.full_name ?? 'Unknown'}</span>
                {' '}submitted · {fmtWhen(row.submitted_at)}
              </li>
              {row.status_changed_at && (
                <li>
                  <span className="font-medium text-gray-800">{statusChangedByRow?.user_profiles?.full_name ?? 'Admin'}</span>
                  {' '}set status to <span className="font-medium">{status?.label}</span> · {fmtWhen(row.status_changed_at)}
                </li>
              )}
              {(comments ?? []).map((c) => (
                <li key={`act-${c.id}`}>
                  <span className="font-medium text-gray-800">{c.user_profiles?.full_name ?? 'Unknown'}</span>
                  {' '}commented · {fmtWhen(c.created_at)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
