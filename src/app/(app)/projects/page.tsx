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

  const [rows, brands, members, ws, levelRows] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: {
        brand: true,
        steps: { orderBy: [{ due_date: 'asc' }, { sort_order: 'asc' }], include: { assignee: true } },
      },
    }),
    prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true, logo_url: true } }),
    prisma.member.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true, seniority: true, capacity_hrs_wk: true, avatar_url: true },
    }),
    prisma.workspaceSettings.findUnique({ where: { id: 1 } }),
    prisma.seniorityLevel.findMany({ orderBy: { sort_order: 'asc' } }),
  ])

  // Decimal columns arrive as Prisma Decimal. Convert once, here at the
  // boundary — the workload module deals in numbers and nothing downstream
  // should have to remember this.
  const levels = Object.fromEntries(levelRows.map(l => [l.key, {
    effortFactor: Number(l.effort_factor),
    supervisionRate: Number(l.supervision_rate),
  }]))
  const settings = {
    hoursPerStepDay:         Number(ws?.hours_per_step_day ?? 8),
    capacityPeriodEnd:       ws?.capacity_period_end ? ws.capacity_period_end.toISOString().slice(0, 10) : null,
    complexityThresholdDays: Number(ws?.complexity_threshold_days ?? 3),
    supervisingRole:         ws?.supervising_role ?? 'Marketing Manager',
  }

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
      milestone: s.milestone,
      complexity: s.complexity,
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
        members={members.map(m => ({
          id: m.id, name: m.name, role: m.role,
          seniority: m.seniority, capacityHrsWk: m.capacity_hrs_wk,
          avatarUrl: m.avatar_url,
        }))}
        settings={settings}
        levels={levels}
        levelList={levelRows.map(l => ({ key: l.key, label: l.label }))}
        isAdmin={member.access === 'admin'}
        canManage={member.access === 'admin' || member.access === 'superuser'}
        viewerId={member.id}
      />
    </div>
  )
}
