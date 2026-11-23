'use server'

/**
 * Task types (spec 023 US1, contracts/server-actions.md). Admins only; every
 * member reads them through the board data. A type is a content type: renaming
 * it renames it on every task and SLA row (the key cascades).
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/authz'
import { isTypeColor, isTypeIcon } from '@/lib/task-types'

type Fail = { success: false; error: string }
const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low', 'None']

export async function saveTaskType(label: string, patch: {
  label?: string; name_ar?: string | null; icon?: string; color?: string; default_priority?: string | null
  default_tag_ids?: string[]; position?: number
}): Promise<{ success: true; label: string } | Fail> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const type = await prisma.contentType.findUnique({ where: { label } })
  if (!type) return { success: false, error: 'not_found' }
  const data: Record<string, unknown> = {}
  if (patch.label !== undefined) {
    const next = patch.label.trim().replace(/\s+/g, ' ')
    if (!next || next.length > 40) return { success: false, error: 'invalid' }
    if (next !== label && await prisma.contentType.findFirst({ where: { label: { equals: next, mode: 'insensitive' }, NOT: { id: type.id } } })) return { success: false, error: 'exists' }
    data.label = next
  }
  if (patch.name_ar !== undefined) data.name_ar = patch.name_ar?.trim().slice(0, 40) || null
  if (patch.icon !== undefined) { if (!isTypeIcon(patch.icon)) return { success: false, error: 'invalid' }; data.icon = patch.icon }
  if (patch.color !== undefined) { if (!isTypeColor(patch.color)) return { success: false, error: 'invalid' }; data.color = patch.color.toUpperCase() }
  if (patch.default_priority !== undefined) {
    if (patch.default_priority !== null && !PRIORITIES.includes(patch.default_priority)) return { success: false, error: 'invalid' }
    data.default_priority = patch.default_priority
  }
  if (patch.default_tag_ids !== undefined) data.default_tag_ids = [...new Set(patch.default_tag_ids.filter(x => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 20)
  if (patch.position !== undefined) data.position = Math.max(0, Math.trunc(patch.position))
  const saved = await prisma.contentType.update({ where: { id: type.id }, data })
  revalidatePath('/', 'layout')
  return { success: true, label: saved.label }
}
