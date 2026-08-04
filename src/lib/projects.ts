import { businessDaysBetween } from '@/lib/utils'

/**
 * Everything both boards count, in one place.
 *
 * The Projects view groups steps by project and the Team view groups the same
 * steps by assignee, so any number that means "late" or "this week" has to
 * agree across both. Deriving them twice is how two screens start telling the
 * same person different things.
 */

export interface StepView {
  id: string
  name: string
  durationDays: number
  dueDate: string | null
  done: boolean
  assigneeId: string | null
  assigneeName: string | null
  taskId: string | null
}

export interface ProjectView {
  id: string
  name: string
  brandId: string | null
  brandName: string | null
  brandColor: string | null
  standing: boolean
  dueDate: string | null
  focus: boolean
  steps: StepView[]
}

export const todayISO = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** A step is late when it has a date, that date has passed, and it is not done. */
export const isLate = (s: StepView, today: string) =>
  !s.done && !!s.dueDate && s.dueDate < today

export const isDueWithin = (s: StepView, today: string, days: number) =>
  !s.done && !!s.dueDate && s.dueDate >= today && s.dueDate <= addDaysISO(today, days)

export interface ProjectStats {
  total: number
  done: number
  late: number
  /** 0–100. Standing work never "finishes", but the ratio is still the honest
   *  answer to how much of what is planned has been done. */
  percent: number
  nextDue: string | null
  daysPlanned: number
}

export function statsOf(p: ProjectView, today: string): ProjectStats {
  const total = p.steps.length
  const done  = p.steps.filter(s => s.done).length
  const late  = p.steps.filter(s => isLate(s, today)).length
  const upcoming = p.steps
    .filter(s => !s.done && s.dueDate)
    .map(s => s.dueDate!)
    .sort()
  return {
    total, done, late,
    percent: total ? Math.round((done / total) * 100) : 0,
    nextDue: upcoming[0] ?? null,
    daysPlanned: p.steps.reduce((n, s) => n + s.durationDays, 0),
  }
}

export interface PortfolioStats {
  projects: number
  steps: number
  done: number
  late: number
  dueThisWeek: number
  daysPlanned: number
  percent: number
  /** Working days between today and the last planned date — the honest
   *  denominator for "can this possibly fit". */
  runwayDays: number
}

export function portfolioStats(projects: ProjectView[], today: string): PortfolioStats {
  const steps = projects.flatMap(p => p.steps)
  const done  = steps.filter(s => s.done).length
  const dated = steps.filter(s => s.dueDate).map(s => s.dueDate!).sort()
  const last  = dated[dated.length - 1]

  return {
    projects: projects.length,
    steps: steps.length,
    done,
    late: steps.filter(s => isLate(s, today)).length,
    dueThisWeek: steps.filter(s => isDueWithin(s, today, 7)).length,
    daysPlanned: steps.reduce((n, s) => n + s.durationDays, 0),
    percent: steps.length ? Math.round((done / steps.length) * 100) : 0,
    runwayDays: last && last > today ? businessDaysBetween(new Date(today), new Date(last)) : 0,
  }
}

/** Steps per day for the next `days` days — the horizon strip. */
export function horizon(projects: ProjectView[], today: string, days = 21) {
  const cells: { date: string; steps: StepView[]; late: boolean }[] = []
  for (let i = 0; i < days; i++) {
    const date = addDaysISO(today, i)
    cells.push({
      date,
      steps: projects.flatMap(p => p.steps).filter(s => !s.done && s.dueDate === date),
      late: false,
    })
  }
  return cells
}

/** Calendar weeks (Mon–Sun) covering every dated step, for the Weeks tab. */
export function weeksOf(projects: ProjectView[], today: string) {
  const dated = projects.flatMap(p =>
    p.steps.filter(s => s.dueDate && !s.done).map(s => ({ ...s, project: p })),
  )
  if (!dated.length) return []

  const sorted = [...dated].sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
  const first  = sorted[0].dueDate! < today ? today : sorted[0].dueDate!
  const last   = sorted[sorted.length - 1].dueDate!

  // Back up to Monday so weeks line up with how people actually plan.
  const start = new Date(first + 'T00:00:00')
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))

  const weeks: { start: string; end: string; items: typeof dated; current: boolean }[] = []
  for (let cursor = start.toISOString().slice(0, 10); cursor <= last; cursor = addDaysISO(cursor, 7)) {
    const end = addDaysISO(cursor, 6)
    weeks.push({
      start: cursor,
      end,
      items: dated.filter(s => s.dueDate! >= cursor && s.dueDate! <= end),
      current: today >= cursor && today <= end,
    })
  }
  return weeks.filter(w => w.items.length || w.current)
}

/**
 * Timeline span of a project — first to last dated step, falling back to the
 * project's own due date. Projects with no dates at all are left out rather
 * than drawn at an invented position.
 */
export function spanOf(p: ProjectView): { start: string; end: string } | null {
  const dates = p.steps.map(s => s.dueDate).filter(Boolean).sort() as string[]
  if (!dates.length) return p.dueDate ? { start: p.dueDate, end: p.dueDate } : null
  return { start: dates[0], end: p.dueDate && p.dueDate > dates[dates.length - 1] ? p.dueDate : dates[dates.length - 1] }
}

export const UNASSIGNED = 'Unassigned'

/** Group projects by brand, with everything unbranded gathered at the end. */
export function byBrand(projects: ProjectView[]): [string, ProjectView[]][] {
  const groups = new Map<string, ProjectView[]>()
  for (const p of projects) {
    const k = p.brandName ?? UNASSIGNED
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(p)
  }
  const named = [...groups.entries()].filter(([k]) => k !== UNASSIGNED).sort((a, b) => a[0].localeCompare(b[0]))
  const rest  = groups.get(UNASSIGNED)
  return rest ? [...named, [UNASSIGNED, rest]] : named
}
