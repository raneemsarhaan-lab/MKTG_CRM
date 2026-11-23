'use server'

/**
 * Tags (spec 023 US4, R8): anyone who may edit a task tags it and may create a
 * tag while tagging; admins rename, recolour, merge and delete.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember, requireAdmin } from '@/lib/authz'
import { canActOn } from '@/lib/task-access'
import { withAssignees } from '@/lib/assignees-server'
import { cleanTagName, mergePlan, nextTagColor, tagKey, TAG_COLORS } from '@/lib/tags'
import type { Tag } from '@/types/index'

type Fail = { success: false; error: string }
const toTag = (t: { id: string; name: string; color: string }): Tag => ({ id: t.id, name: t.name, color: t.color })
const refresh = () => revalidatePath('/', 'layout')

/** A tag by name: the existing one (ignoring case and spacing) or a new one. Any signed-in member. */
export async function createTag(name: string): Promise<{ success: true; tag: Tag; created: boolean } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const n = cleanTagName(name)
  if (!n) return { success: false, error: 'empty' }
  const found = await prisma.tag.findUnique({ where: { key: tagKey(n) } })
  if (found) return { success: true, tag: toTag(found), created: false }
  const t = await prisma.tag.create({ data: { name: n, key: tagKey(n), color: nextTagColor(await prisma.tag.count()), created_by: me.id } })
  refresh()
  return { success: true, tag: toTag(t), created: true }
}

/** A task's tags, replaced. */
export async function setTaskTags(taskId: string, tagIds: string[]): Promise<{ success: true } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const found = await prisma.task.findUnique({ where: { id: taskId } })
  if (!found) return { success: false, error: 'not_found' }
  if (!canActOn(await withAssignees(found), me)) return { success: false, error: 'not_authorized' }
  const ids = [...new Set((Array.isArray(tagIds) ? tagIds : []).filter(x => typeof x === 'string'))].slice(0, 30)
  const real = (await prisma.tag.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(t => t.id)
  await prisma.$transaction([
    prisma.taskTag.deleteMany({ where: { task_id: taskId } }),
    prisma.taskTag.createMany({ data: real.map(tag_id => ({ task_id: taskId, tag_id })) }),
  ])
  refresh()
  return { success: true }
}

export async function renameTag(id: string, name: string): Promise<{ success: true } | Fail> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  const n = cleanTagName(name)
  if (!n) return { success: false, error: 'empty' }
  const clash = await prisma.tag.findUnique({ where: { key: tagKey(n) } })
  if (clash && clash.id !== id) return { success: false, error: 'exists' }
  await prisma.tag.update({ where: { id }, data: { name: n, key: tagKey(n) } }).catch(() => null)
  refresh()
  return { success: true }
}

export async function recolorTag(id: string, color: string): Promise<{ success: true } | Fail> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  if (!(TAG_COLORS as readonly string[]).includes(color)) return { success: false, error: 'invalid' }
  await prisma.tag.update({ where: { id }, data: { color } }).catch(() => null)
  refresh()
  return { success: true }
}

/** Merge `from` into `into`: every task tagged `from` is tagged `into` (once); `from` goes. */
export async function mergeTags(from: string, into: string): Promise<{ success: true; moved: number } | Fail> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  if (from === into) return { success: false, error: 'invalid' }
  const links = await prisma.taskTag.findMany({ where: { tag_id: { in: [from, into] } } })
  const plan = mergePlan(links, from, into)
  await prisma.$transaction([
    prisma.taskTag.createMany({ data: plan.add.map(task_id => ({ task_id, tag_id: into })), skipDuplicates: true }),
    prisma.tag.delete({ where: { id: from } }),
  ])
  refresh()
  return { success: true, moved: plan.drop.length }
}

export async function deleteTag(id: string): Promise<{ success: true } | Fail> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }
  await prisma.tag.deleteMany({ where: { id } })
  refresh()
  return { success: true }
}
