'use server'

/**
 * Several assignees (spec 023 US5, D11–D12). The first is the lead: it stays in
 * tasks.assignee_id, so the SLA, alerts, Shows in and every filter keep reading
 * one person. Only the lead's Spaces join Shows in; changing the lead follows
 * the Shows in removal rule (spec 022). Hours: each person's own, or an even
 * share of the estimate.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { canActOn } from '@/lib/task-access'
import { withAssignees } from '@/lib/assignees-server'
import { changeAssigneeSpaces } from '@/lib/spaces-server'
import { follow, notify, notifyAfter } from '@/lib/notify/notify'

type Fail = { success: false; error: string }
const MAX_ASSIGNEES = 10

export async function setAssignees(taskId: string, list: { member_id: string; hours?: number | null }[]): Promise<{ success: true; ids: string[] } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const found = await prisma.task.findUnique({ where: { id: taskId } })
  if (!found) return { success: false, error: 'not_found' }
  const task = await withAssignees(found)
  if (!canActOn(task, me)) return { success: false, error: 'not_authorized' }
  if (task.dropped_at) return { success: false, error: 'dropped' }

  const seen = new Set<string>()
  const clean = (Array.isArray(list) ? list : []).filter(x => x && typeof x.member_id === 'string' && !seen.has(x.member_id) && seen.add(x.member_id)).slice(0, MAX_ASSIGNEES)
  const known = new Set((await prisma.member.findMany({ where: { id: { in: clean.map(x => x.member_id) } }, select: { id: true } })).map(m => m.id))
  if (clean.some(x => !known.has(x.member_id))) return { success: false, error: 'invalid' }
  const hours = (h: unknown) => (typeof h === 'number' && Number.isFinite(h) && h >= 0 ? Math.min(Math.round(h * 4) / 4, 999) : null)

  const oldLead = task.assignee_id
  const lead = clean[0]?.member_id ?? null
  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { assignee_id: lead, updated_at: new Date() } }),
    prisma.taskAssignee.deleteMany({ where: { task_id: taskId } }),
    prisma.taskAssignee.createMany({ data: clean.map((x, i) => ({ task_id: taskId, member_id: x.member_id, position: i, hours: hours(x.hours) })) }),
  ])
  // D12: only the lead's Spaces join Shows in.
  if (lead !== oldLead) await changeAssigneeSpaces(prisma, task, oldLead, lead, me.id)

  const added = clean.map(x => x.member_id).filter(id => !task.assignee_ids.includes(id))
  if (added.length) {
    await notifyAfter(async tx => {
      const ids: string[] = []
      for (const id of added) {
        await follow(tx, taskId, id, { clearMute: true })
        ids.push(...await notify(tx, { kind: 'assigned', actorId: me.id, taskId, assigneeId: id }))
      }
      return ids
    })
  }
  revalidatePath('/', 'layout')
  return { success: true, ids: clean.map(x => x.member_id) }
}
