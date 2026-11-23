import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { mapContentType, mapTaskField, mapTypeField } from '@/lib/mappers'
import { TaskTypesPage } from '@/components/types/TaskTypesPage'

/**
 * Task types & fields (spec 023 US1–US2). Everyone reads it; admins edit task
 * types, admins and superusers edit the field library. The actions enforce
 * that again — this page only decides what to offer.
 */
export default async function TaskTypesRoute() {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const [types, fields, links, sla, counts, tags] = await Promise.all([
    prisma.contentType.findMany({ orderBy: [{ position: 'asc' }, { label: 'asc' }] }),
    prisma.taskField.findMany({ orderBy: [{ position: 'asc' }, { created_at: 'asc' }] }),
    prisma.taskTypeField.findMany({ orderBy: { position: 'asc' } }),
    prisma.slaConfig.findMany({ select: { content_type_label: true, max_business_days: true } }),
    prisma.task.groupBy({ by: ['content_type_label'], where: { dropped_at: null }, _count: { _all: true } }),
    // Spec 023 (US4): the workspace's tags, with how many tasks use each.
    prisma.tag.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true, _count: { select: { tasks: true } } } }),
  ])
  const slaDays: Record<string, number> = {}
  for (const r of sla) slaDays[r.content_type_label] = (slaDays[r.content_type_label] ?? 0) + Number(r.max_business_days)
  const taskCounts: Record<string, number> = {}
  for (const c of counts) if (c.content_type_label) taskCounts[c.content_type_label] = c._count._all
  return (
    <TaskTypesPage
      types={types.map(mapContentType)}
      fields={fields.map(mapTaskField)}
      links={links.map(mapTypeField)}
      slaDays={slaDays}
      taskCounts={taskCounts}
      canEditTypes={member.access === 'admin'}
      canEditFields={member.access !== 'user'}
      tags={tags.map(x => ({ id: x.id, name: x.name, color: x.color, count: x._count.tasks }))}
    />
  )
}
