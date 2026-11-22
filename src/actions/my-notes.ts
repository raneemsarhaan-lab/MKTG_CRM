'use server'

/**
 * "My notes" (spec 021 FR-013b, research R7): a regular column on a member's
 * own task sheet that only that member sees. Stored as a spec 010 column whose
 * sheet key is `me:<memberId>`, with one value per task — so it reuses the
 * column and value tables, and no one else's loader ever reads it.
 */
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'

const MAX = 2000

async function myColumn(memberId: string, create: boolean): Promise<string | null> {
  const sheet = `me:${memberId}`
  const found = await prisma.sheetColumn.findFirst({ where: { sheet, key: 'notes', deleted_at: null }, select: { id: true } })
  if (found || !create) return found?.id ?? null
  const made = await prisma.sheetColumn.create({
    data: { sheet, key: 'notes', name: null, position: 0, kind: 'text', created_by: memberId, updated_by: memberId },
    select: { id: true },
  }).catch(async () => prisma.sheetColumn.findFirst({ where: { sheet, key: 'notes' }, select: { id: true } }))
  return made?.id ?? null
}

/** This member's notes, by task id. */
export async function myNotes(): Promise<{ success: true; notes: Record<string, string> } | { success: false; error: string }> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  const col = await myColumn(m.id, false)
  if (!col) return { success: true, notes: {} }
  const rows = await prisma.sheetValue.findMany({ where: { column_id: col }, select: { task_id: true, value: true } })
  return { success: true, notes: Object.fromEntries(rows.map(r => [r.task_id, r.value])) }
}

/** Set (or, with empty text, clear) one of this member's notes. Only ever their own column. */
export async function setMyNote(taskId: string, text: string): Promise<{ success: true } | { success: false; error: string }> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  const value = String(text ?? '').slice(0, MAX)
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } })
  if (!task) return { success: false, error: 'not_found' }
  const col = await myColumn(m.id, !!value.trim())
  if (!col) return { success: true }
  if (!value.trim()) await prisma.sheetValue.deleteMany({ where: { column_id: col, task_id: taskId } })
  else await prisma.sheetValue.upsert({
    where: { column_id_task_id: { column_id: col, task_id: taskId } },
    update: { value, updated_by: m.id, updated_at: new Date() },
    create: { column_id: col, task_id: taskId, value, updated_by: m.id },
  })
  return { success: true }
}
