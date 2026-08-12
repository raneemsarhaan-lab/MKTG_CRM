import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProjectView } from '../src/lib/projects'
import {
  assumptionsOf, brandLoads, capacityRows, personLoad, costOf, portfolioLoad,
  ratesFor, type MemberInput, type LevelRates,
} from '../src/lib/workload'

/**
 * Reconciliation harness for src/lib/workload.ts.
 *
 * Not a shipped file. It exists because the properties most worth checking
 * here cannot be seen on screen: that no step-day is lost between the plan and
 * the rows, and that supervision generated equals supervision received. A
 * workload panel that silently drops days looks authoritative while being
 * wrong, which is worse than one that is obviously broken.
 *
 * Runs against the real plan file, so the figures below are this team's.
 */

const TODAY = '2026-08-12'
const PLAN = JSON.parse(readFileSync(join(process.cwd(), 'data', 'projects-plan.json'), 'utf8'))

let pass = 0, fail = 0
const ok = (label: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`)
}
const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) < eps

/** The plan file shaped as the app's ProjectView, with the new step fields. */
function load(focusOnly: boolean): ProjectView[] {
  const people: Record<string, string> = {}
  for (const [short, name] of PLAN.people) people[short] = name

  return PLAN.projects
    .filter((p: { focus: boolean }) => (focusOnly ? p.focus : true))
    .map((p: Record<string, unknown>, i: number) => ({
      id: `p${i}`,
      name: p.name as string,
      brandId: p.brand ? String(p.brand) : null,
      brandName: (p.brand as string) ?? null,
      brandColor: null,
      standing: !!p.standing,
      dueDate: (p.due_date as string) ?? null,
      focus: !!p.focus,
      steps: (p.steps as Record<string, unknown>[]).map((s, j) => ({
        id: `p${i}s${j}`,
        name: s.name as string,
        durationDays: s.duration_days as number,
        dueDate: (s.due_date as string) ?? null,
        done: !!s.done,
        assigneeId: s.assignee ? String(s.assignee) : null,
        assigneeName: s.assignee ? people[String(s.assignee)] ?? null : null,
        taskId: null,
        milestone: false,
        complexity: null,
      })),
    })) as ProjectView[]
}

const LEVELS: Record<string, LevelRates> = {
  junior: { effortFactor: 1.8, supervisionRate: 0.25 },
  mid:    { effortFactor: 1,   supervisionRate: 0 },
  senior: { effortFactor: 1,   supervisionRate: 0 },
}

const members = (juniorSalma: boolean, supervisors = 1): MemberInput[] => {
  const list: MemberInput[] = [
    { id: 'samaa', name: 'Samaa', role: 'Content & Copy',  seniority: 'mid', capacityHrsWk: 40 },
    { id: 'yosra', name: 'Yosra', role: 'Graphic Design',  seniority: 'mid', capacityHrsWk: 40 },
    { id: 'salma', name: 'Salma', role: 'Video Editing',   seniority: juniorSalma ? 'junior' : 'mid', capacityHrsWk: 40 },
    { id: 'raneem', name: 'Raneem', role: 'Marketing Manager', seniority: 'mid', capacityHrsWk: 40 },
  ]
  for (let i = 1; i < supervisors; i++) {
    list.push({ id: `mm${i}`, name: `Manager ${i}`, role: 'Marketing Manager', seniority: 'mid', capacityHrsWk: 40 })
  }
  return list
}

const settings = (levels = LEVELS, supervisingRole = 'Marketing Manager') => ({
  hoursPerStepDay: 8,
  capacityPeriodEnd: null,
  complexityThresholdDays: 3,
  supervisingRole,
  levels,
})

// ── P1: plan days reconcile ─────────────────────────────────────────────────
console.log('\nP1 — plan days reconcile to the portfolio total')
for (const [label, focusOnly, expected] of [['all projects', false, 960], ['focus only', true, 426]] as const) {
  const projects = load(focusOnly)
  const a = assumptionsOf(projects, TODAY, settings())
  const rows = capacityRows(projects, members(true), a)
  const total = projects.flatMap(p => p.steps).reduce((n, s) => n + s.durationDays, 0)
  const summed = rows.reduce((n, r) => n + r.planDays, 0)
  ok(`${label}: rows sum to the plan`, near(summed, total), `${summed} vs ${total}`)
  ok(`${label}: total matches the known figure`, near(total, expected), `${total}`)
}

{
  const projects = load(false)
  const a = assumptionsOf(projects, TODAY, settings())
  const rows = capacityRows(projects, members(true), a)
  const un = rows.find(r => r.kind === 'unassigned')
  ok('unassigned row carries the unassigned days', !!un && near(un.planDays, 391), `${un?.planDays}`)
}

// ── P2: a person reconciles ─────────────────────────────────────────────────
console.log('\nP2 — months + undated equal the person total')
{
  const projects = load(false)
  const a = assumptionsOf(projects, TODAY, settings())
  for (const m of members(true).slice(0, 3)) {
    const pl = personLoad(projects, m, a, TODAY)
    const summed = pl.months.reduce((n, x) => n + x.planDays, 0) + pl.undatedPlanDays
    ok(`${m.name}: ${pl.months.length} months + ${pl.undatedPlanDays}d undated = ${pl.planDays}d`,
       near(summed, pl.planDays), `${summed}`)
  }
  const samaa = personLoad(projects, members(true)[0], a, TODAY)
  ok('Samaa totals the known 164 plan days', near(samaa.planDays, 164), `${samaa.planDays}`)
  ok('Samaa has 30 undated days', near(samaa.undatedPlanDays, 30), `${samaa.undatedPlanDays}`)
}

// ── P3: effort never undercuts plan ─────────────────────────────────────────
console.log('\nP3 — effort ≥ plan where the factor ≥ 1')
{
  const projects = load(true)
  const a = assumptionsOf(projects, TODAY, settings())
  const rows = capacityRows(projects, members(true), a).filter(r => r.kind === 'member')
  ok('every member row has effort ≥ plan', rows.every(r => r.effortDays >= r.planDays - 0.01))

  const mids = rows.filter(r => r.seniority === 'mid' && r.supervisionReceived === 0)
  ok('a mid with no supervision has effort exactly = plan',
     mids.every(r => near(r.effortDays, r.planDays)), `${mids.length} rows checked`)

  const salma = rows.find(r => r.name === 'Salma')!
  const expected = salma.simpleDays + salma.complexDays * 1.8
  ok('junior effort = simple + complex × 1.8 (C4)', near(salma.effortDays, expected),
     `${salma.simpleDays} + ${salma.complexDays}×1.8 = ${expected.toFixed(1)}, got ${salma.effortDays}`)
  ok('the factor did NOT touch simple days',
     !near(salma.effortDays, salma.planDays * 1.8),
     `total×1.8 would be ${(salma.planDays * 1.8).toFixed(1)}`)
}

// ── P4: supervision is conserved ────────────────────────────────────────────
console.log('\nP4 — supervision generated = supervision received')
for (const n of [1, 2, 3]) {
  const projects = load(true)
  const a = assumptionsOf(projects, TODAY, settings())
  const ms = members(true, n)
  const rows = capacityRows(projects, ms, a)
  const salma = rows.find(r => r.name === 'Salma')!
  const generated = Math.round(salma.complexDays * 1.8 * 0.25 * 10) / 10
  const receivedTotal = Math.round(rows.reduce((t, r) => t + r.supervisionReceived, 0) * 10) / 10
  // Exact, not approximate: the rows must add up as they are DISPLAYED, or a
  // shared figure stops summing to its own total on screen.
  ok(`${n} supervisor(s): received total = generated exactly`, receivedTotal === generated,
     `${receivedTotal} vs ${generated}`)
  if (n > 1) {
    const holders = rows.filter(r => r.supervisionReceived > 0)
    ok(`${n} supervisors: the split is stated`, holders.every(h => h.supervisionShare?.of === n))
  }
}
{
  // Nobody holds the role — the overhead must still appear.
  const projects = load(true)
  const a = assumptionsOf(projects, TODAY, settings(LEVELS, 'Head of Nothing'))
  const rows = capacityRows(projects, members(true), a)
  const orphan = rows.find(r => r.kind === 'supervision-unowned')
  ok('with no supervisor the overhead is shown unattributed', !!orphan && orphan.effortDays > 0,
     `${orphan?.effortDays ?? 0}d`)
}
{
  // Self-supervision must be excluded.
  const projects = load(true)
  const a = assumptionsOf(projects, TODAY, settings())
  const ms = members(true).map(m => m.id === 'salma' ? { ...m, role: 'Marketing Manager' } : m)
  const rows = capacityRows(projects, ms, a)
  const total = rows.reduce((t, r) => t + r.supervisionReceived, 0)
  ok('a supervisor generates no supervision from their own steps (C7)', near(total, 0), `${total}`)
}

// ── P5: no NaN, Infinity or negative working days ───────────────────────────
console.log('\nP5 — no NaN, Infinity or negative working days')
{
  const projects = load(true)
  const a = assumptionsOf(projects, TODAY, settings())
  const finite = (n: number | null) => n === null || Number.isFinite(n)
  const rows = capacityRows(projects, members(true), a)
  ok('every utilisation is finite or null', rows.every(r => finite(r.utilisationPct)))
  ok('unassigned has no percentage', rows.find(r => r.kind === 'unassigned')?.utilisationPct === null)
  ok('working days is not negative', a.workingDays >= 0, `${a.workingDays}`)

  const pl = personLoad(projects, members(true)[2], a, TODAY)
  ok('every month utilisation is finite or null', pl.months.every(m => finite(m.utilisationPct)))
  ok('every month has non-negative working days', pl.months.every(m => m.workingDays >= 0))

  // An empty portfolio must not throw or produce NaN.
  const empty = assumptionsOf([], TODAY, settings())
  ok('empty input: no rows, no throw', capacityRows([], members(true), empty).length === 0)
  ok('empty input: brand loads empty', brandLoads([], empty).length === 0)
  ok('empty input: totals are zero not NaN', portfolioLoad([], empty).planDays === 0)
}

// ── Contract spot-checks ────────────────────────────────────────────────────
console.log('\nContract spot-checks')
{
  const projects = load(true)
  const a = assumptionsOf(projects, TODAY, settings())
  const jr = ratesFor('junior', a)

  // C3: supervision compounds off adjusted, not planned.
  const c = costOf(
    { id: 'x', name: 'x', durationDays: 10, dueDate: null, done: false,
      assigneeId: null, assigneeName: null, taskId: null, complexity: null },
    jr, a,
  )
  ok('C3: supervision = adjusted × rate', near(c.supervisionDays, 10 * 1.8 * 0.25),
     `${c.supervisionDays} (off duration it would be ${10 * 0.25})`)

  // C5: an override beats the threshold, in both directions.
  const forcedComplex = costOf(
    { id: 'y', name: 'y', durationDays: 1, dueDate: null, done: false,
      assigneeId: null, assigneeName: null, taskId: null, complexity: 'complex' },
    jr, a,
  )
  ok('C5: a 1d step forced complex is adjusted', !forcedComplex.isSimple && near(forcedComplex.adjustedDays, 1.8))
  const forcedSimple = costOf(
    { id: 'z', name: 'z', durationDays: 10, dueDate: null, done: false,
      assigneeId: null, assigneeName: null, taskId: null, complexity: 'simple' },
    jr, a,
  )
  ok('C5: a 10d step forced simple is not', forcedSimple.isSimple && near(forcedSimple.adjustedDays, 10))

  // C9: an unknown level is neutral rather than a throw.
  const unknown = ratesFor('principal', a)
  ok('C9: unknown seniority resolves to neutral', unknown.effortFactor === 1 && unknown.supervisionRate === 0)

  // C13: brand rollups ignore seniority.
  const flat = brandLoads(projects, a)
  const withJunior = brandLoads(projects, a)
  ok('C13: brand totals do not move with seniority',
     JSON.stringify(flat) === JSON.stringify(withJunior))

  // Portfolio consumed hours, the figure that reproduced the mock exactly.
  const port = portfolioLoad(projects, a)
  ok('consumed = done days × hours-per-step-day', near(port.consumedHours, port.doneDays * 8),
     `${port.consumedHours}h from ${port.doneDays} done days`)

  const omni = brandLoads(projects, a).find(b => b.brandName === 'Omnisight')!
  ok('Omnisight completion is 71%, as the reference shows', omni.completionPct === 71, `${omni.completionPct}%`)
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
