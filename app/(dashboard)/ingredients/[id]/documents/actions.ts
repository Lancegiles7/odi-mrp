'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { IngredientDocType } from '@/lib/types/database.types'

const BUCKET = 'ingredient-docs'
const MAX_BYTES = 10 * 1024 * 1024  // 10 MB
const ALLOWED_DOC_TYPES = new Set<IngredientDocType>([
  'coa', 'spec', 'allergen', 'nutrition', 'cert', 'pricing', 'other',
])

export interface UploadedDoc {
  id:           string
  file_name:    string
  doc_type:     IngredientDocType
  size_bytes:   number | null
  notes:        string | null
  expires_at:   string | null
  uploaded_at:  string
  uploaded_by_name: string | null
}

interface UploadResult { ok: boolean; error?: string }
interface DeleteResult { ok: boolean; error?: string }

// ────────────────────────────────────────────────────────────
// Upload — accepts FormData with file + metadata.
// ────────────────────────────────────────────────────────────
export async function uploadIngredientDocument(formData: FormData): Promise<UploadResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const ingredientId = ((formData.get('ingredient_id') as string | null) ?? '').trim()
  const docType      = ((formData.get('doc_type') as string | null) ?? '').trim() as IngredientDocType
  const notes        = ((formData.get('notes') as string | null) ?? '').trim() || null
  const expiresAt    = ((formData.get('expires_at') as string | null) ?? '').trim() || null
  const file         = formData.get('file') as File | null

  if (!ingredientId)              return { ok: false, error: 'Missing ingredient id' }
  if (!file || file.size === 0)   return { ok: false, error: 'No file selected' }
  if (file.size > MAX_BYTES)      return { ok: false, error: 'File too large (10 MB max)' }
  if (!ALLOWED_DOC_TYPES.has(docType)) return { ok: false, error: 'Pick a document type' }

  // Profile id for the audit field. user_profiles.id mirrors auth.users.id.
  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('id', user.id).maybeSingle() as { data: { id: string } | null }

  // Object path: <ingredient_id>/<timestamp>-<filename>. Timestamp keeps
  // re-uploads of the same name from clobbering each other.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  const ts       = String(new Date().getTime())
  const objectPath = `${ingredientId}/${ts}-${safeName}`

  // Stream file → Storage.
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, { contentType: file.type, upsert: false })
  if (uploadErr) return { ok: false, error: `Upload failed: ${uploadErr.message}` }

  // Insert metadata row.
  const { error: insertErr } = await supabase
    .from('ingredient_documents')
    .insert({
      ingredient_id: ingredientId,
      file_path:     objectPath,
      file_name:     file.name,
      doc_type:      docType,
      size_bytes:    file.size,
      mime_type:     file.type || null,
      notes,
      expires_at:    expiresAt,
      uploaded_by:   profile?.id ?? null,
    } as never)

  if (insertErr) {
    // Roll back the Storage upload so we don't leak orphan files.
    await supabase.storage.from(BUCKET).remove([objectPath]).catch(() => {})
    return { ok: false, error: `Metadata save failed: ${insertErr.message}` }
  }

  revalidatePath(`/ingredients/${ingredientId}`)
  return { ok: true }
}

// ────────────────────────────────────────────────────────────
// Delete — removes both the metadata row and the Storage object.
// ────────────────────────────────────────────────────────────
export async function deleteIngredientDocument(docId: string): Promise<DeleteResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (!docId) return { ok: false, error: 'Missing document id' }

  // Look up the file path so we can delete the actual file too.
  const { data: doc } = await supabase
    .from('ingredient_documents')
    .select('file_path, ingredient_id')
    .eq('id', docId)
    .maybeSingle() as { data: { file_path: string; ingredient_id: string } | null }

  if (!doc) return { ok: false, error: 'Document not found' }

  // Delete the Storage object first; the DB row is the source of truth so
  // we keep that until the file is actually gone.
  await supabase.storage.from(BUCKET).remove([doc.file_path]).catch(() => {})

  const { error } = await supabase.from('ingredient_documents').delete().eq('id', docId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/ingredients/${doc.ingredient_id}`)
  return { ok: true }
}

// ────────────────────────────────────────────────────────────
// Sign download URL — Storage bucket is private, so each download
// needs a short-lived signed URL.
// ────────────────────────────────────────────────────────────
export async function getDocumentDownloadUrl(docId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: doc } = await supabase
    .from('ingredient_documents')
    .select('file_path, file_name')
    .eq('id', docId)
    .maybeSingle() as { data: { file_path: string; file_name: string } | null }
  if (!doc) return { ok: false, error: 'Document not found' }

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 60, { download: doc.file_name })

  if (error || !signed) return { ok: false, error: error?.message ?? 'Sign failed' }
  return { ok: true, url: signed.signedUrl }
}
