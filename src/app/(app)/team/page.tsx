import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { TeamBoard, type TeamStep } from '@/components/projects/TeamBoard'

/**
 * Team tasks.
 *
 * The rule lives here, in the query: a member is only ever sent the steps
 * assigned to them. Not fetched-then-hidden — a client filter is a suggestion,
 * and the payload would still contain everyone else's work. Admins get the
 * lot, with a tab per person.
 */
export default async function TeamPage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')

  const isAdmin = member.access === 'admin'

  const [rows, brands, allMembers, projects] = await Promise.all([
    prisma.projectStep.findMany({
      where: isAdmin ? { assignee_id: { not: null } } : { assignee_id: member.id },
      orderBy: [{ due_date: 'asc' }, { sort_order: 'asc' }],
      include: { assignee: true, project: { include: { brand: true } } },
    }),
    prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true } }),
    prisma.member.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.project.findMany({
      orderBy: [{ focus: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, brand: { select: { name: true } } },
    }),
  ])

  const steps: TeamStep[] = rows.map(s => ({
    id: s.id,
    name: s.name,
    durationDays: Number(s.duration_days),
    dueDate: s.due_date ? s.due_date.toISOString().slice(0, 10) : null,
    done: s.done,
    assigneeId: s.assignee_id,
    assigneeName: s.assignee?.name ?? null,
    taskId: s.task_id,
    projectId: s.project_id,
    projectName: s.project.name,
    brandName: s.project.brand?.name ?? null,
    brandColor: s.project.brand?.color ?? null,
  }))

  // Only people who actually have planned work, so the tabs stay short.
  const people = isAdmin
    ? [...new Map(rows.filter(r => r.assignee).map(r => [r.assignee!.id, {
        id: r.assignee!.id, name: r.assignee!.name, role: r.assignee!.role,
      }])).values()].sort((a, b) => a.name.localeCompare(b.name))
    : [{ id: member.id, name: member.name, role: member.role }]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TeamBoard
        steps={steps}
        people={people}
        allMembers={allMembers}
        projects={projects.map(p => ({ id: p.id, name: p.name, brandName: p.brand?.name ?? null }))}
        brands={brands}
        isAdmin={isAdmin}
        viewerId={member.id}
        canPush={member.access !== 'user'}
      />
    </div>
  )
}
