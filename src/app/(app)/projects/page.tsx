import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { ProjectsView } from '@/components/projects/ProjectsView'
import type { ProjectView } from '@/lib/projects'

/**
 * Projects Overview — Aspiring and Focus.
 *
 * Everyone signed in can read the plan; only admins can reshape it, which the
 * actions enforce independently. `isAdmin` here decides what is worth
 * rendering, not what is permitted.
 */
export default async function ProjectsPage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')

  const [rows, brands, members] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: {
        brand: true,
        steps: { orderBy: [{ due_date: 'asc' }, { sort_order: 'asc' }], include: { assignee: true } },
      },
    }),
    prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true } }),
    prisma.member.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  const projects: ProjectView[] = rows.map(p => ({
    id: p.id,
    name: p.name,
    brandId: p.brand_id,
    brandName: p.brand?.name ?? null,
    brandColor: p.brand?.color ?? null,
    standing: p.standing,
    dueDate: p.due_date ? p.due_date.toISOString().slice(0, 10) : null,
    focus: p.focus,
    steps: p.steps.map(s => ({
      id: s.id,
      name: s.name,
      durationDays: Number(s.duration_days),
      dueDate: s.due_date ? s.due_date.toISOString().slice(0, 10) : null,
      done: s.done,
      assigneeId: s.assignee_id,
      assigneeName: s.assignee?.name ?? null,
      taskId: s.task_id,
    })),
  }))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ProjectsView
        projects={projects}
        brands={brands}
        members={members}
        isAdmin={member.access === 'admin'}
      />
    </div>
  )
}
