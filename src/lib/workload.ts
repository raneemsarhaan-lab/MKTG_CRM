import type { ProjectView, StepView } from '@/lib/projects'
import { businessDaysBetween } from '@/lib/utils'

/**
 * Workload — the plan priced in days, hours and people.
 *
 * Pure: no React, no Prisma, no clock. `today` is always passed in. That keeps
 * it runnable straight against data/projects-plan.json, which matters because
 * the properties worth checking here — that no step-day is lost, that
 * supervision is conserved — are invisible on screen.
 *
 * ── Two quantities, not one ────────────────────────────────────────────────
 *
 * Plan days are what the plan says: the sum of step durations. They always
 * reconcile — every capacity row plus the unassigned row equals the portfolio
 * total. That property is the main defence against being quietly wrong.
 *
 * Effort days are what it will cost: plan days adjusted for who is doing the
 * work, plus supervision that belongs to someone who was never assigned it.
 * They deliberately do not reconcile, and asserting that they should would be
 * a bug in the test rather than in the code.
 *
 * Utilisation is measured on effort, because that answers "can this person
 * absorb this". Reconciliation is checked on plan, because that is what the
 * plan actually says.
 */

export interface LevelRates {
  effortFactor: number
  supervisionRate: number
}

/** What an unknown seniority resolves to: no adjustment, no supervision. */
export const NEUTRAL: LevelRates = { effortFactor: 1, supervisionRate: 0 }

export interface WorkloadAssumptions {
  hoursPerStepDay: number
  /** Always today. Never stored — a stored start goes stale in silence. */
  periodStart: string
  periodEnd: string
  workingDays: number
  complexityThresholdDays: number
  supervisingRole: string
  levels: Record<string, LevelRates>
}

export interface MemberInput {
  id: string
  name: string
  role: string
  seniority: string
  capacityHrsWk: number
  avatarUrl?: string | null
}

export interface StepCost {
  planDays: number
  isSimple: boolean
  adjustedDays: number
  supervisionDays: number
}

export interface BrandLoad {
  brandId: string | null
  brandName: string
  brandColor: string | null
  projects: number
  steps: number
  milestones: number
  planDays: number
  doneDays: number
  hours: number
  completionPct: number
}

export interface CapacityRow {
  kind: 'member' | 'unassigned' | 'supervision-unowned'
  memberId?: string
  name: string
  role?: string
  seniority?: string
  factor?: number
  planDays: number
  simpleDays: number
  complexDays: number
  effortDays: number
  supervisionReceived: number
  /** Set only when the supervising role is held by more than one person. */
  supervisionShare?: { of: number }
  hours: number
  availableHours: number
  /** Null — never Infinity or NaN — when there are no available hours. */
  utilisationPct: number | null
  over: boolean
}

export interface MonthLoad {
  month: string
  label: string
  planDays: number
  effortDays: number
  workingDays: number
  utilisationPct: number | null
  over: boolean
}

export interface PersonLoad {
  memberId: string
  name: string
  role: string
  seniority: string
  steps: number
  stepsOpen: number
  planDays: number
  effortDays: number
  daysOpen: number
  hours: number
  overdueCount: number
  oldestOverdue: string | null
  months: MonthLoad[]
  undatedPlanDays: number
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** Money-safe-ish rounding. Sums stay exact; only the last step rounds. */
const r1 = (n: number) => Math.round(n * 10) / 10

export function ratesFor(level: string, a: WorkloadAssumptions): LevelRates {
  return a.levels[level] ?? NEUTRAL
}

/**
 * Resolve the period. A null end runs to the last dated step in scope; with
 * nothing dated the period is empty and workingDays is 0, which every
 * percentage below is written to survive.
 */
export function assumptionsOf(
  projects: ProjectView[],
  today: string,
  settings: {
    hoursPerStepDay: number
    capacityPeriodEnd: string | null
    complexityThresholdDays: number
    supervisingRole: string
    levels: Record<string, LevelRates>
  },
): WorkloadAssumptions {
  const dated = projects
    .flatMap(p => p.steps)
    .map(s => s.dueDate)
    .filter((d): d is string => !!d)
    .sort()

  const end = settings.capacityPeriodEnd ?? dated[dated.length - 1] ?? today
  const periodEnd = end < today ? today : end

  return {
    hoursPerStepDay: settings.hoursPerStepDay,
    periodStart: today,
    periodEnd,
    workingDays: businessDaysBetween(new Date(today + 'T00:00:00'), new Date(periodEnd + 'T00:00:00')),
    complexityThresholdDays: settings.complexityThresholdDays,
    supervisingRole: settings.supervisingRole,
    levels: settings.levels,
  }
}

/**
 * Price one step.
 *
 * The order here is the rule, not a detail:
 *
 *   adjusted    = isSimple ? days : days × factor
 *   supervision = isSimple ? 0    : adjusted × rate
 *
 * Two ways to get this wrong, both producing plausible numbers. Applying the
 * factor to every step rather than the complex ones inflates a wholly-junior
 * plan from 625d to 767d. Taking supervision off `days` rather than `adjusted`
 * understates it by 44% at the default rates, because supervision compounds
 * with the factor rather than sitting beside it.
 */
export function costOf(
  step: StepView & { milestone?: boolean; complexity?: string | null },
  level: LevelRates,
  a: WorkloadAssumptions,
): StepCost {
  const planDays = step.durationDays

  // An explicit override wins over the threshold, and keeps winning when
  // someone later tunes the threshold.
  const isSimple = step.complexity === 'simple' ? true
    : step.complexity === 'complex' ? false
    : planDays <= a.complexityThresholdDays

  const adjustedDays    = isSimple ? planDays : planDays * level.effortFactor
  const supervisionDays = isSimple ? 0 : adjustedDays * level.supervisionRate

  return { planDays, isSimple, adjustedDays, supervisionDays }
}

/**
 * Brand rollup.
 *
 * Plan days only. Seniority describes how long a person takes, not how much
 * work the plan contains, so a brand's total must not move when someone is
 * promoted.
 */
export function brandLoads(projects: ProjectView[], a: WorkloadAssumptions): BrandLoad[] {
  const groups = new Map<string, BrandLoad>()

  for (const p of projects) {
    const key = p.brandId ?? '__none__'
    let g = groups.get(key)
    if (!g) {
      g = {
        brandId: p.brandId,
        brandName: p.brandName ?? 'No brand',
        brandColor: p.brandColor,
        projects: 0, steps: 0, milestones: 0,
        planDays: 0, doneDays: 0, hours: 0, completionPct: 0,
      }
      groups.set(key, g)
    }
    g.projects++
    for (const s of p.steps) {
      const step = s as StepView & { milestone?: boolean }
      g.steps++
      g.planDays += s.durationDays
      if (step.milestone) g.milestones++
      if (s.done) g.doneDays += s.durationDays
    }
  }

  return [...groups.values()]
    .map(g => ({
      ...g,
      planDays: r1(g.planDays),
      doneDays: r1(g.doneDays),
      hours: r1(g.planDays * a.hoursPerStepDay),
      completionPct: g.planDays > 0 ? Math.round((g.doneDays / g.planDays) * 100) : 0,
    }))
    .sort((x, y) => y.planDays - x.planDays || x.brandName.localeCompare(y.brandName))
}

/**
 * One row per member holding work, plus an unassigned row, plus — when
 * supervision was generated and nobody holds the supervising role — a row for
 * that too.
 *
 * The last one matters. Work that needs supervising and has no supervisor is a
 * finding, not a rounding error, and dropping it would hide the very condition
 * worth surfacing.
 */
export function capacityRows(
  projects: ProjectView[],
  members: MemberInput[],
  a: WorkloadAssumptions,
): CapacityRow[] {
  const byId = new Map(members.map(m => [m.id, m]))
  const supervisors = members.filter(m => m.role === a.supervisingRole)
  const supervisorIds = new Set(supervisors.map(m => m.id))

  type Acc = { plan: number; simple: number; complex: number; adjusted: number }
  const acc = new Map<string, Acc>()
  let unassignedPlan = 0
  let supervisionGenerated = 0

  const bump = (id: string) => {
    let v = acc.get(id)
    if (!v) { v = { plan: 0, simple: 0, complex: 0, adjusted: 0 }; acc.set(id, v) }
    return v
  }

  for (const p of projects) {
    for (const s of p.steps) {
      const step = s as StepView & { complexity?: string | null }
      if (!s.assigneeId) {
        // No assignee means no level, so no factor and no supervision. Showing
        // an effort figure here would invent both a person and their seniority.
        unassignedPlan += s.durationDays
        continue
      }
      const member = byId.get(s.assigneeId)
      const rates = member ? ratesFor(member.seniority, a) : NEUTRAL
      const cost = costOf(step, rates, a)

      const v = bump(s.assigneeId)
      v.plan += cost.planDays
      v.adjusted += cost.adjustedDays
      if (cost.isSimple) v.simple += cost.planDays
      else v.complex += cost.planDays

      // Nobody supervises their own work, or the figure feeds on itself.
      if (!supervisorIds.has(s.assigneeId)) supervisionGenerated += cost.supervisionDays
    }
  }

  // Split evenly, rounding each share the way it will be displayed and giving
  // the last holder whatever is left. Rounding each share independently and
  // then displaying them is how a shared figure quietly stops adding up: three
  // holders of 14.85 days become 5.0 + 5.0 + 5.0 = 15.0 on screen. Handing the
  // remainder over keeps the rows summing to the total as shown, not merely as
  // computed.
  const received = new Map<string, number>()
  if (supervisors.length) {
    const target = r1(supervisionGenerated)
    const share = r1(supervisionGenerated / supervisors.length)
    let handed = 0
    supervisors.forEach((m, i) => {
      const amount = i === supervisors.length - 1 ? r1(target - handed) : share
      handed = r1(handed + amount)
      received.set(m.id, amount)
    })
  }

  const dailyRate = (m: MemberInput) => m.capacityHrsWk / 5
  const rows: CapacityRow[] = []

  for (const m of members) {
    const v = acc.get(m.id)
    const sup = received.get(m.id) ?? 0
    if (!v && !sup) continue          // holds nothing — not a row

    const plan = v?.plan ?? 0
    const effort = (v?.adjusted ?? 0) + sup
    const hours = effort * a.hoursPerStepDay
    const availableHours = a.workingDays * dailyRate(m)

    rows.push({
      kind: 'member',
      memberId: m.id,
      name: m.name,
      role: m.role,
      seniority: m.seniority,
      factor: ratesFor(m.seniority, a).effortFactor,
      planDays: r1(plan),
      simpleDays: r1(v?.simple ?? 0),
      complexDays: r1(v?.complex ?? 0),
      effortDays: r1(effort),
      supervisionReceived: r1(sup),
      supervisionShare: supervisors.length > 1 && sup > 0 ? { of: supervisors.length } : undefined,
      hours: r1(hours),
      availableHours: r1(availableHours),
      utilisationPct: availableHours > 0 ? Math.round((hours / availableHours) * 100) : null,
      over: availableHours > 0 && hours >= availableHours,
    })
  }

  rows.sort((x, y) => y.effortDays - x.effortDays || x.name.localeCompare(y.name))

  if (unassignedPlan > 0) {
    rows.push({
      kind: 'unassigned',
      name: 'Unassigned',
      planDays: r1(unassignedPlan),
      simpleDays: 0, complexDays: 0,
      effortDays: 0,
      supervisionReceived: 0,
      hours: r1(unassignedPlan * a.hoursPerStepDay),
      availableHours: 0,
      utilisationPct: null,
      over: false,
    })
  }

  if (!supervisors.length && supervisionGenerated > 0) {
    rows.push({
      kind: 'supervision-unowned',
      name: `Supervision — no ${a.supervisingRole}`,
      planDays: 0, simpleDays: 0, complexDays: 0,
      effortDays: r1(supervisionGenerated),
      supervisionReceived: r1(supervisionGenerated),
      hours: r1(supervisionGenerated * a.hoursPerStepDay),
      availableHours: 0,
      utilisationPct: null,
      over: false,
    })
  }

  return rows
}

/** Weekdays in `month` ('YYYY-MM'), clipped to the assumption period. */
export function workingDaysInMonth(month: string, a: WorkloadAssumptions): number {
  const [y, m] = month.split('-').map(Number)
  const first = `${month}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = `${month}-${String(lastDay).padStart(2, '0')}`

  const from = first > a.periodStart ? first : a.periodStart
  const to   = last  < a.periodEnd   ? last  : a.periodEnd
  if (from > to) return 0

  // businessDaysBetween is exclusive of `to`, and a month's last working day
  // belongs to that month — step one day past it.
  const toExclusive = new Date(to + 'T00:00:00')
  toExclusive.setDate(toExclusive.getDate() + 1)
  return businessDaysBetween(new Date(from + 'T00:00:00'), toExclusive)
}

/** One person in depth: their totals, their months, and their undated work. */
export function personLoad(
  projects: ProjectView[],
  member: MemberInput,
  a: WorkloadAssumptions,
  today: string,
): PersonLoad {
  const rates = ratesFor(member.seniority, a)
  const mine = projects
    .flatMap(p => p.steps)
    .filter(s => s.assigneeId === member.id) as (StepView & { complexity?: string | null })[]

  let planDays = 0, effortDays = 0, daysOpen = 0, stepsOpen = 0
  let overdueCount = 0
  let oldestOverdue: string | null = null
  let undatedPlanDays = 0

  const months = new Map<string, { plan: number; effort: number }>()

  for (const s of mine) {
    const cost = costOf(s, rates, a)
    planDays += cost.planDays
    effortDays += cost.adjustedDays

    if (!s.done) {
      stepsOpen++
      daysOpen += cost.planDays
      if (s.dueDate && s.dueDate < today) {
        overdueCount++
        if (!oldestOverdue || s.dueDate < oldestOverdue) oldestOverdue = s.dueDate
      }
    }

    if (!s.dueDate) {
      // No date means no month. Reported on its own rather than assigned to a
      // month it does not belong to.
      undatedPlanDays += cost.planDays
      continue
    }
    const key = s.dueDate.slice(0, 7)
    const bucket = months.get(key) ?? { plan: 0, effort: 0 }
    bucket.plan += cost.planDays
    bucket.effort += cost.adjustedDays
    months.set(key, bucket)
  }

  const dailyRate = member.capacityHrsWk / 5
  const monthList: MonthLoad[] = [...months.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([month, v]) => {
      const wd = workingDaysInMonth(month, a)
      const availableHours = wd * dailyRate
      const hours = v.effort * a.hoursPerStepDay
      return {
        month,
        label: MONTHS[Number(month.slice(5, 7)) - 1],
        planDays: r1(v.plan),
        effortDays: r1(v.effort),
        workingDays: wd,
        utilisationPct: availableHours > 0 ? Math.round((hours / availableHours) * 100) : null,
        over: availableHours > 0 && hours >= availableHours,
      }
    })

  return {
    memberId: member.id,
    name: member.name,
    role: member.role,
    seniority: member.seniority,
    steps: mine.length,
    stepsOpen,
    planDays: r1(planDays),
    effortDays: r1(effortDays),
    daysOpen: r1(daysOpen),
    hours: r1(effortDays * a.hoursPerStepDay),
    overdueCount,
    oldestOverdue,
    months: monthList,
    undatedPlanDays: r1(undatedPlanDays),
  }
}

/** Portfolio totals — the KPI row. Plan days, and progress valued in hours. */
export function portfolioLoad(projects: ProjectView[], a: WorkloadAssumptions) {
  const steps = projects.flatMap(p => p.steps) as (StepView & { milestone?: boolean })[]
  const planDays = steps.reduce((n, s) => n + s.durationDays, 0)
  const doneDays = steps.filter(s => s.done).reduce((n, s) => n + s.durationDays, 0)
  const expectedHours = planDays * a.hoursPerStepDay
  const consumedHours = doneDays * a.hoursPerStepDay

  const milestones = steps.filter(s => s.milestone)
  const ahead = milestones.filter(s => !s.dueDate || s.dueDate >= a.periodStart).length

  return {
    projects: projects.length,
    projectsDone: projects.filter(p => p.steps.length > 0 && p.steps.every(s => s.done)).length,
    steps: steps.length,
    planDays: r1(planDays),
    doneDays: r1(doneDays),
    expectedHours: r1(expectedHours),
    consumedHours: r1(consumedHours),
    consumedPct: expectedHours > 0 ? Math.round((consumedHours / expectedHours) * 100) : 0,
    milestones: milestones.length,
    milestonesAhead: ahead,
    milestonesPassed: milestones.length - ahead,
    unassignedDays: r1(steps.filter(s => !s.assigneeId).reduce((n, s) => n + s.durationDays, 0)),
  }
}
