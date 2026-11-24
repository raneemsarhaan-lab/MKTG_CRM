'use server'

/**
 * Spec 025 (§3, Assets tab): a brand's files. Anyone signed in can add a file
 * or a link and edit what they added; admins and superusers can edit and
 * delete any. Files on the brand's finished tasks are listed with them,
 * read-only: they belong to their task.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { configured as storageConfigured, deleteObject, putObject } from '@/lib/storage'
import { MAX_ATTACHMENT_CHARS } from '@/lib/attachments'
import { asKind, guessKind, type AssetKind, type AssetRow } from '@/lib/brand-assets'

type Fail = { success: false; error: 'not_authenticated' | 'not_authorized' | 'not_found' | 'invalid' | 'too_large' | 'generic' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FINISHED = ['final-check', 'ready-publish', 'scheduled', 'publish']
const lead = (m: { access: string }) => m.access === 'admin' || m.access === 'superuser'
const clean = (s: unknown, max = 200) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const touch = (brandId: string) => { revalidatePath(`/brands/${brandId}`, 'layout') }

/** Every file of the brand: its own assets, then the files on its finished tasks. */
export async function listBrandAssets(brandId: string): Promise<{ success: true; rows: AssetRow[]; canAdd: boolean; lead: boolean; me: string } | Fail> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  if (!UUID.test(brandId) || !(await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } }))) return { success: false, error: 'not_found' }
  const [assets, files] = await Promise.all([
    prisma.brandAsset.findMany({
      where: { brand_id: brandId }, orderBy: { uploaded_at: 'desc' },
      select: { id: true, filename: true, url: true, kind: true, content_type: true, size_bytes: true, thumb: true, uploaded_at: true,
        adder: { select: { id: true, name: true } }, task: { select: { id: true, name: true } } },
    }),
    // Finished designs: what was attached to the brand's tasks that reached F-Check or later.
    prisma.taskAttachment.findMany({
      where: { task: { brand_id: brandId, dropped_at: null, status: { in: FINISHED } } }, orderBy: { uploaded_at: 'desc' }, take: 400,
      select: { id: true, filename: true, url: true, content_type: true, size_bytes: true, uploaded_at: true, uploaded_by: true,
        task: { select: { id: true, name: true, cover_thumb: true } } },
    }),
  ])
  const names = new Map((await prisma.member.findMany({ select: { id: true, name: true } })).map(x => [x.id, x.name]))
  const isImage = (ct: string | null, name: string) => (ct ?? '').startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(name)
  const rows: AssetRow[] = [
    ...assets.map(a => ({
      key: `a:${a.id}`, id: a.id, source: 'asset' as const, name: a.filename, kind: asKind(a.kind),
      // Bytes kept in the database are served by the file route, never sent with the list.
      href: a.url || `/api/brand-assets/${a.id}`,
      preview: a.thumb ?? (a.url && isImage(a.content_type, a.filename) ? a.url : null),
      content_type: a.content_type, size_bytes: a.size_bytes, task: a.task, added_by: a.adder, added_at: a.uploaded_at.toISOString(),
    })),
    ...files.map(f => ({
      key: `t:${f.id}`, id: f.id, source: 'task' as const, name: f.filename, kind: 'design' as const,
      // A file kept inside its task (no address of its own) is opened from the task.
      href: f.url ?? null,
      preview: f.url && isImage(f.content_type, f.filename) ? f.url : isImage(f.content_type, f.filename) ? f.task.cover_thumb ?? null : null,
      content_type: f.content_type, size_bytes: f.size_bytes, task: { id: f.task.id, name: f.task.name },
      added_by: f.uploaded_by && names.has(f.uploaded_by) ? { id: f.uploaded_by, name: names.get(f.uploaded_by)! } : null,
      added_at: f.uploaded_at.toISOString(),
    })),
  ]
  return { success: true, rows, canAdd: true, lead: lead(m), me: m.id }
}

/** Add a file (a data URL read in the browser) or a link. A small `thumb` is the table's preview. */
export async function addBrandAsset(brandId: string, input: {
  filename: string; data?: string; url?: string; content_type?: string | null; size_bytes?: number | null; thumb?: string | null; kind?: AssetKind | null; task_id?: string | null
}): Promise<{ success: true; id: string } | Fail> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  if (!UUID.test(brandId) || !(await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } }))) return { success: false, error: 'not_found' }
  const filename = clean(input.filename) || 'file'
  const contentType = clean(input.content_type, 100) || null
  const thumb = typeof input.thumb === 'string' && input.thumb.startsWith('data:image/') && input.thumb.length < 200_000 ? input.thumb : null
  const taskId = input.task_id && UUID.test(input.task_id) && (await prisma.task.findFirst({ where: { id: input.task_id, brand_id: brandId }, select: { id: true } })) ? input.task_id : null
  const base = { brand_id: brandId, filename, content_type: contentType, kind: input.kind ? asKind(input.kind) : guessKind(filename, contentType), thumb, added_by: m.id, task_id: taskId }
  if (input.url) {
    const url = clean(input.url, 2000)
    if (!/^https?:\/\//i.test(url)) return { success: false, error: 'invalid' }
    const row = await prisma.brandAsset.create({ data: { ...base, url } })
    touch(brandId)
    return { success: true, id: row.id }
  }
  const data = typeof input.data === 'string' ? input.data : ''
  const match = /^data:([^;,]*)(;base64)?,/.exec(data)
  if (!match) return { success: false, error: 'invalid' }
  if (storageConfigured()) {
    const bytes = Buffer.from(data.slice(match[0].length), match[2] ? 'base64' : 'utf8')
    const ext = filename.match(/\.[A-Za-z0-9]{1,8}$/)?.[0]?.toLowerCase() ?? ''
    const key = `brands/${brandId}/${crypto.randomUUID()}${ext}`
    const url = await putObject(key, new Uint8Array(bytes), contentType ?? match[1] ?? '').catch(() => null)
    if (!url) return { success: false, error: 'generic' }
    const row = await prisma.brandAsset.create({ data: { ...base, url, storage_key: key, size_bytes: bytes.length } })
    touch(brandId)
    return { success: true, id: row.id }
  }
  // No bucket: the file stays in the database, within the same limit as a task attachment.
  if (data.length > MAX_ATTACHMENT_CHARS) return { success: false, error: 'too_large' }
  const row = await prisma.brandAsset.create({ data: { ...base, url: '', data, size_bytes: typeof input.size_bytes === 'number' ? Math.max(0, Math.round(input.size_bytes)) : null } })
  touch(brandId)
  return { success: true, id: row.id }
}

async function mine(id: string) {
  const m = await getSessionMember()
  if (!m) return { error: 'not_authenticated' as const }
  const row = UUID.test(id) ? await prisma.brandAsset.findUnique({ where: { id }, select: { id: true, brand_id: true, added_by: true, storage_key: true } }) : null
  if (!row) return { error: 'not_found' as const }
  if (!lead(m) && row.added_by !== m.id) return { error: 'not_authorized' as const }
  return { m, row }
}

/** Rename, set the type, or link to one of the brand's tasks (null unlinks). */
export async function updateBrandAsset(id: string, patch: { filename?: string; kind?: AssetKind; task_id?: string | null }): Promise<{ success: true } | Fail> {
  const x = await mine(id)
  if ('error' in x) return { success: false, error: x.error! }
  const data: { filename?: string; kind?: string; task_id?: string | null } = {}
  if (patch.filename !== undefined) { const n = clean(patch.filename); if (!n) return { success: false, error: 'invalid' }; data.filename = n }
  if (patch.kind !== undefined) data.kind = asKind(patch.kind)
  if (patch.task_id !== undefined) {
    if (patch.task_id === null) data.task_id = null
    else {
      if (!UUID.test(patch.task_id) || !(await prisma.task.findFirst({ where: { id: patch.task_id, brand_id: x.row.brand_id }, select: { id: true } }))) return { success: false, error: 'invalid' }
      data.task_id = patch.task_id
    }
  }
  await prisma.brandAsset.update({ where: { id }, data })
  touch(x.row.brand_id)
  return { success: true }
}

export async function deleteBrandAsset(id: string): Promise<{ success: true } | Fail> {
  const x = await mine(id)
  if ('error' in x) return { success: false, error: x.error! }
  await prisma.brandAsset.delete({ where: { id } })
  if (x.row.storage_key) await deleteObject(x.row.storage_key)
  touch(x.row.brand_id)
  return { success: true }
}
