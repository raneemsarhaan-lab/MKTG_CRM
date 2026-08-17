import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { MyBoard } from '@/components/myboard/MyBoard'
import type { PanelTask } from '@/components/myboard/BoardTaskPanel'
import type { BreachRow } from '@/components/myboard/SlaBreachedPanel'
import { typeEmoji } from '@/lib/myboard'
import { businessDaysBetween } from '@/lib/utils'
import type { StageId } from '@/types/index'

/**
 * My Board — the personal dashboard.
 *
 * Handoff §9.1: all four stat numbers, both task lists and the breach list
 * come from a single dashboard read. One request, one loading state.
 *
 * Note on routing: the handoff names this route /my-board. It is served at
 * /overview here, which is the route the rest of the app already redirects to
 * (page guards, middleware). The nav rail's Overview item points at it.
 */
export default async function OverviewPage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')

  const [openTasks, completed, slaRows] = await Promise.all([
    prisma.task.findMany({
      // My Day is the work you are doing, not the work you are answerable
      // for — see the assignee_id comment in schema.prisma.
      where:   { assignee_id: member.id, NOT: { status: 'publish' } },
      include: { task_owner: true },
      orderBy: { due_date: 'asc' },
    }),
    prisma.task.findMany({
      where:  { assignee_id: member.id, status: 'publish' },
      select: { id: true, updated_at: true },
    }),
    prisma.slaConfig.findMany(),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(today)
  endOfWeek.setDate(endOfWeek.getDate() + 7)

  const startOfWeek = new Date(today)
  startOfWeek.setDate(startOfWeek.getDate() - 7)

  const iso = (d: Date) => d.toISOString().split('T')[0]

  // SLA lookup: [stage][contentType] → max business days
  const sla = new Map<string, number>()
  for (const r of slaRows) sla.set(`${r.stage_id}|${r.content_type_label}`, r.max_business_days)

  // A task with no due date (imported history) is never "due" — it is
  // excluded from My Day / This Week but still counts for SLA breach.
  const rows = openTasks.map(t => {
    const due = t.due_date ? new Date(t.due_date) : null
    due?.setHours(0, 0, 0, 0)
    return {
      id:      t.id,
      title:   t.name,
      emoji:   typeEmoji(t.content_type_label),
      stage:   t.status as StageId,
      dueDate: due ? iso(due) : null,
      due,
      stageDays: businessDaysBetween(new Date(t.stage_date), today),
      // For the day planner: hours_estimate is in hours and mostly zero, so
      // the planner assumes a length for those and says so on the slot.
      mins:      Math.round(Number(t.hours_estimate ?? 0) * 60),
      priority:  (t.priority as 'High' | 'Medium' | 'Low') ?? 'Medium',
      dueOffset: due ? Math.round((due.getTime() - today.getTime()) / 86_400_000) : null,
      slaDays:   sla.get(`${t.status}|${t.content_type_label ?? ''}`) ?? 1,
      ownerName: t.task_owner?.name ?? '—',
    }
  })

  const toPanelTask = (r: (typeof rows)[number]): PanelTask => ({
    id: r.id, title: r.title, emoji: r.emoji, stage: r.stage, dueDate: r.dueDate,
  })

  // My Day — due today or already overdue. This Week — the next seven days.
  const myDay    = rows.filter(r => r.due && r.due <= today)
  const thisWeek = rows.filter(r => r.due && r.due > today && r.due <= endOfWeek)

  // A breach is time-in-stage past the stage's SLA for that content type.
  const breaches: BreachRow[] = rows
    .filter(r => r.stageDays > r.slaDays)
    .map(r => ({
      id:             r.id,
      title:          r.title,
      emoji:          r.emoji,
      stage:          r.stage,
      ownerName:      r.ownerName,
      dueDate:        r.dueDate,
      slaDays:        r.slaDays,
      breachedByDays: r.stageDays - r.slaDays,
    }))

  const completedThisWeek = completed.filter(c => c.updated_at >= startOfWeek).length

  return (
    <MyBoard
      firstName={member.name.split(' ')[0]}
      stats={{
        today:    myDay.length,
        week:     thisWeek.length,
        breached: breaches.length,
        completedThisWeek,
      }}
      myDayPlan={myDay.map(r => ({
        id: r.id, name: r.title, mins: r.mins,
        due: r.dueOffset, priority: r.priority,
      }))}
      thisWeek={thisWeek.map(toPanelTask)}
      breaches={breaches}
    />
  )
}
