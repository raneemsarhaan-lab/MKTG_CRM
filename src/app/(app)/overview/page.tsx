import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { MyBoard } from '@/components/myboard/MyBoard'
import type { PanelTask } from '@/components/myboard/BoardTaskPanel'
import type { BreachRow } from '@/components/myboard/SlaBreachedPanel'
import { typeEmoji, weekStart, weekSpan, COLUMN_ROWS } from '@/lib/myboard'
import { businessDaysBetween } from '@/lib/utils'
import type { StageId } from '@/types/index'
import type { Prisma } from '@prisma/client'

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

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const member = await getSessionMember()
  if (!member) redirect('/login')

  // Team view is admin-only and decided *here*, from the session member — the
  // toggle in the header is a convenience, not the gate. A non-admin who types
  // ?view=team gets their own board, because this line ignores the parameter
  // for them. There is no RLS behind this to catch a mistake.
  const canSeeTeam = member.access === 'admin'
  const teamView   = canSeeTeam && (await searchParams).view === 'team'

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Real weeks, not rolling seven-day windows: the working week runs Sunday to
  // Thursday, so a week opens on Sunday and every panel agrees where the line
  // is. Late in the week "This Week" thins out — that is the truth of it, and
  // My Day still carries anything due today or already overdue.
  const weekOpen     = weekStart(today)
  const nextWeekOpen = new Date(weekOpen); nextWeekOpen.setDate(nextWeekOpen.getDate() + 7)
  const lastWeekOpen = new Date(weekOpen); lastWeekOpen.setDate(lastWeekOpen.getDate() - 7)

  // My Day is the work you are doing, not the work you are answerable for —
  // see the assignee_id comment in schema.prisma. The team view widens that to
  // everyone's work; a task nobody has picked up is in nobody's day, so it
  // stays out of both and is the board's problem, not the dashboard's.
  const scope: Prisma.TaskWhereInput = teamView
    ? { assignee_id: { not: null } }
    : { assignee_id: member.id }

  const [openTasks, completed, slaRows] = await Promise.all([
    prisma.task.findMany({
      where:   { ...scope, NOT: { status: 'publish' } },
      include: { task_owner: true, assignee: true },
      orderBy: { due_date: 'asc' },
    }),
    // Two weeks, which is everything displayed: last week's shipped list and
    // this week's Completed count. Reading every task the team has ever
    // published to count two weeks of them does not scale.
    prisma.task.findMany({
      where:   { ...scope, status: 'publish', updated_at: { gte: lastWeekOpen } },
      include: { assignee: true },
      orderBy: { updated_at: 'desc' },
    }),
    prisma.slaConfig.findMany(),
  ])

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
      ownerName:   t.task_owner?.name ?? '—',
      ownerAvatar: t.task_owner?.avatar_url ?? null,
      person:    t.assignee?.name ?? 'Unassigned',
    }
  })

  // The person chip is only worth a line in the team view — in your own board
  // every row is yours and naming you on each one is noise.
  const toPanelTask = (r: (typeof rows)[number]): PanelTask => ({
    id: r.id, title: r.title, emoji: r.emoji, stage: r.stage, dueDate: r.dueDate,
    person: teamView ? r.person : undefined,
  })

  // My Day — due today or already overdue. This Week — the rest of this week.
  const myDay    = rows.filter(r => r.due && r.due <= today)
  const thisWeek = rows.filter(r => r.due && r.due > today && r.due < nextWeekOpen)

  // Last week, both halves of it: work that shipped in it, and work that was
  // due in it and is still open. The second half is the point of the section —
  // it is the only place a slip is named as a slip rather than folded into
  // today's list.
  const shipped: PanelTask[] = completed.filter(t => t.updated_at < weekOpen).map(t => ({
    id:      t.id,
    title:   t.name,
    emoji:   typeEmoji(t.content_type_label),
    stage:   'publish' as StageId,
    // updated_at is the closest thing to a ship date the model carries; it is
    // already what the Completed card counts.
    dueDate: iso(t.updated_at),
    done:    true,
    person:  teamView ? (t.assignee?.name ?? 'Unassigned') : undefined,
  }))

  const slipped: PanelTask[] = rows
    .filter(r => r.due && r.due >= lastWeekOpen && r.due < weekOpen)
    .map(toPanelTask)

  // Slips lead, but never so many that the week's shipped work falls off the
  // panel entirely — half the visible rows are held for each side unless one
  // is short. Nothing is dropped here: what does not fit is ordered behind
  // what does, and the panel counts the overflow on its "+N more" line.
  const half     = Math.floor(COLUMN_ROWS / 2)
  const slipTake = Math.min(slipped.length, Math.max(half, COLUMN_ROWS - shipped.length))
  const shipTake = Math.min(shipped.length, COLUMN_ROWS - slipTake)
  const lastWeek = [
    ...slipped.slice(0, slipTake),
    ...shipped.slice(0, shipTake),
    ...slipped.slice(slipTake),
    ...shipped.slice(shipTake),
  ]

  // A breach is time-in-stage past the stage's SLA for that content type.
  const breaches: BreachRow[] = rows
    .filter(r => r.stageDays > r.slaDays)
    .map(r => ({
      id:             r.id,
      title:          r.title,
      emoji:          r.emoji,
      stage:          r.stage,
      ownerName:      r.ownerName,
      ownerAvatar:    r.ownerAvatar,
      dueDate:        r.dueDate,
      slaDays:        r.slaDays,
      breachedByDays: r.stageDays - r.slaDays,
    }))

  return (
    <MyBoard
      firstName={member.name.split(' ')[0]}
      canSeeTeam={canSeeTeam}
      teamView={teamView}
      stats={{
        today:             myDay.length,
        week:              thisWeek.length,
        breached:          breaches.length,
        // What shipped since Sunday — the week you are in, not the last seven days.
        completedThisWeek: completed.length - shipped.length,
      }}
      thisWeekSpan={weekSpan(weekOpen)}
      lastWeekSpan={weekSpan(lastWeekOpen)}
      myDayPlan={myDay.map(r => ({
        id: r.id, name: r.title, mins: r.mins,
        due: r.dueOffset, priority: r.priority,
      }))}
      today={myDay.map(toPanelTask)}
      thisWeek={thisWeek.map(toPanelTask)}
      lastWeek={lastWeek}
      breaches={breaches}
    />
  )
}
