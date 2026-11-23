'use server'

/**
 * Milestones (spec 023 US3, R6): calendar markers for a brand — a name and a
 * day. Not tasks. Admins and superusers add, rename, move and delete them.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireTaskCreator } from '@/lib/authz'
import { mapMilestone } from '@/lib/mappers'
import type { Milestone } from '@/types/index'

type Fail = { success: false; error: string }
const DAY = /^\d{4}-\d{2}-\d{2}$/
const cleanName = (n: unknown) => (typeof n === 'string' ? n.trim().replace(/\s+/g, ' ').slice(0, 80) : '')

export async function addMilestone(input: { brand_id: string; name: string; day: string }): Promise<{ success: true; milestone: Milestone } | Fail> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const name = cleanName(input.name)
  if (!name || !DAY.test(input.day ?? '')) return { success: false, error: 'invalid' }
  if (!(await prisma.brand.findUnique({ where: { id: input.brand_id }, select: { id: true } }))) return { success: false, error: 'not_found' }
  const m = await prisma.milestone.create({ data: { brand_id: input.brand_id, name, day: new Date(`${input.day}T00:00:00Z`), created_by: auth.member.id } })
  revalidatePath('/', 'layout')
  return { success: true, milestone: mapMilestone(m) }
}

export async function updateMilestone(id: string, patch: { name?: string; day?: string }): Promise<{ success: true; milestone: Milestone } | Fail> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) { const n = cleanName(patch.name); if (!n) return { success: false, error: 'invalid' }; data.name = n }
  if (patch.day !== undefined) { if (!DAY.test(patch.day)) return { success: false, error: 'invalid' }; data.day = new Date(`${patch.day}T00:00:00Z`) }
  const m = await prisma.milestone.update({ where: { id }, data }).catch(() => null)
  if (!m) return { success: false, error: 'not_found' }
  revalidatePath('/', 'layout')
  return { success: true, milestone: mapMilestone(m) }
}

export async function deleteMilestone(id: string): Promise<{ success: true } | Fail> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  await prisma.milestone.deleteMany({ where: { id } })
  revalidatePath('/', 'layout')
  return { success: true }
}
