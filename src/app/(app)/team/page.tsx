import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { TeamBoard, type TeamStep } from '@/components/projects/TeamBoard'
import { assumptionsOf, personLoad } from '@/lib/workload'
import { todayISO, type ProjectView } from '@/lib/projects'

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

  const [rows, brands, allMembers, projects, ws, levelRows] = await Promise.all([
    prisma.projectStep.findMany({
      // parent_id: null — the team board measures days and capacity, and a
      // sub-step carries neither. Counting the pieces as well as the step they
      // came from would inflate everyone's list without adding a day's work.
      where: isAdmin
        ? { parent_id: null, assignee_id: { not: null } }
        : { parent_id: null, assignee_id: member.id },
      orderBy: [{ due_date: 'asc' }, { sort_order: 'asc' }],
      include: { assignee: true, project: { include: { brand: true } } },
    }),
    prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true } }),
    prisma.member.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.project.findMany({
      orderBy: [{ focus: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, brand: { select: { name: true } } },
    }),
    prisma.workspaceSettings.findUnique({ where: { id: 1 } }),
    prisma.seniorityLevel.findMany(),
  ])

  const steps: TeamStep[] = rows.map(s => ({
    id: s.id,
    name: s.name,
    durationDays: Number(s.duration_days),
    dueDate: s.due_date ? s.due_date.toISOString().slice(0, 10) : null,
    done: s.done,
    assigneeId: s.assignee_id,
    assigneeName: s.assignee?.name ?? null,
    assigneeAvatar: s.assignee?.avatar_url ?? null,
    taskId: s.task_id,
    projectId: s.project_id,
    projectName: s.project.name,
    brandName: s.project.brand?.name ?? null,
    brandColor: s.project.brand?.color ?? null,
    brandLogo: s.project.brand?.logo_url ?? null,
  }))

  // Only people who actually have planned work, so the tabs stay short.
  const people = isAdmin
    ? [...new Map(rows.filter(r => r.assignee).map(r => [r.assignee!.id, {
        id: r.assignee!.id, name: r.assignee!.name, role: r.assignee!.role,
        avatar: r.assignee!.avatar_url ?? null,
      }])).values()].sort((a, b) => a.name.localeCompare(b.name))
    : [{ id: member.id, name: member.name, role: member.role, avatar: member.avatar_url ?? null }]

  // A person's own workload card (FR-021). Computed here rather than in the
  // component so it comes from the same module the admin panel reads — the two
  // must never produce different numbers for the same human being.
  //
  // `rows` is already scoped to the viewer for a non-admin, so this reshapes
  // exactly what they are allowed to see and nothing more.
  const mineRows = rows.filter(r => r.assignee_id === member.id)
  const asProjects: ProjectView[] = [{
    id: 'own', name: 'own', brandId: null, brandName: null, brandColor: null,
    standing: false, dueDate: null, focus: true,
    steps: mineRows.map(s => ({
      id: s.id, name: s.name,
      durationDays: Number(s.duration_days),
      dueDate: s.due_date ? s.due_date.toISOString().slice(0, 10) : null,
      done: s.done, assigneeId: s.assignee_id, assigneeName: s.assignee?.name ?? null,
      taskId: s.task_id, milestone: s.milestone, complexity: s.complexity,
    })),
  }]
  const today = todayISO()
  const assumptions = assumptionsOf(asProjects, today, {
    hoursPerStepDay:         Number(ws?.hours_per_step_day ?? 8),
    capacityPeriodEnd:       ws?.capacity_period_end ? ws.capacity_period_end.toISOString().slice(0, 10) : null,
    complexityThresholdDays: Number(ws?.complexity_threshold_days ?? 3),
    supervisingRole:         ws?.supervising_role ?? 'Marketing Manager',
    levels: Object.fromEntries(levelRows.map(l => [l.key, {
      effortFactor: Number(l.effort_factor), supervisionRate: Number(l.supervision_rate),
    }])),
  })
  const myLoad = personLoad(asProjects, {
    id: member.id, name: member.name, role: member.role,
    seniority: member.seniority ?? 'mid', capacityHrsWk: member.capacity_hrs_wk,
  }, assumptions, today)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TeamBoard
        myLoad={myLoad}
        hoursPerStepDay={assumptions.hoursPerStepDay}
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
