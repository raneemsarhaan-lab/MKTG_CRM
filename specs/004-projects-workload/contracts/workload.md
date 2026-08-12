# Phase 1 Contracts: Projects Workload

**Feature**: `specs/004-projects-workload` | **Date**: 2026-08-12 (rewritten post-clarification)

Four interfaces: the calculation module, three server actions, the component props, and the rendering contract. The module is the important one — with five configurable inputs feeding three surfaces, it is the only thing that keeps them agreeing.

---

## 1. Calculation module — `src/lib/workload.ts`

Pure. **Imports neither React nor Prisma**, so it can be exercised directly against `data/projects-plan.json` with `tsx`.

```ts
import type { ProjectView, StepView } from '@/lib/projects'

export interface LevelRates { effortFactor: number; supervisionRate: number }

export interface WorkloadAssumptions {
  hoursPerStepDay: number
  periodStart: string              // ISO, always today
  periodEnd: string                // ISO
  workingDays: number
  complexityThresholdDays: number
  supervisingRole: string
  levels: Record<string, LevelRates>
}

export interface MemberInput {
  id: string
  name: string
  role: string
  seniority: string                // 'junior' | 'mid' | 'senior' | anything
  capacityHrsWk: number
  avatarUrl?: string | null
}

/** Neutral rates for an unknown level — see data-model "Resilience". */
export const NEUTRAL: LevelRates = { effortFactor: 1, supervisionRate: 0 }

/** Resolve the period. `end` null → the last dated step in `projects`. */
export function assumptionsOf(
  projects: ProjectView[], today: string,
  settings: {
    hoursPerStepDay: number; capacityPeriodEnd: string | null
    complexityThresholdDays: number; supervisingRole: string
    levels: Record<string, LevelRates>
  },
): WorkloadAssumptions

/** Price one step. The override wins over the threshold. */
export function costOf(
  step: StepView, level: LevelRates, a: WorkloadAssumptions,
): { planDays: number; isSimple: boolean; adjustedDays: number; supervisionDays: number }

/** Brand rollup, heaviest first; unbranded projects group under UNASSIGNED. */
export function brandLoads(projects: ProjectView[], a: WorkloadAssumptions): BrandLoad[]

/**
 * One row per member holding load, plus `unassigned`, plus
 * `supervision-unowned` when supervision was generated with nobody to take it.
 */
export function capacityRows(
  projects: ProjectView[], members: MemberInput[], a: WorkloadAssumptions,
): CapacityRow[]

export function personLoad(
  projects: ProjectView[], member: MemberInput,
  a: WorkloadAssumptions, today: string,
): PersonLoad

export function workingDaysInMonth(month: string, a: WorkloadAssumptions): number
```

### Behavioural guarantees

| # | Guarantee |
|---|---|
| C1 | **`Σ capacityRows[].planDays` = `Σ projects[].steps[].durationDays`.** Every step-day lands in exactly one row. *Asserted on plan days only* — effort days are not expected to reconcile. |
| C2 | `Σ personLoad.months[].planDays + undatedPlanDays === personLoad.planDays` |
| C3 | **Order of operations is fixed**: `adjusted = isSimple ? days : days × factor`, then `supervision = isSimple ? 0 : adjusted × rate`. Supervision compounds off `adjusted`. Computing it off `days` understates it by ~44% at the default rates. |
| C4 | **The factor applies only to complex steps.** `effortDays = simpleDays + (complexDays × factor)`, never `totalDays × factor`. |
| C5 | `costOf` prefers `step.complexity` when set; the threshold decides only when it is null. An override survives a threshold change. |
| C6 | **Supervision is conserved**: total generated = total received, across role-holders or on the unowned row. Splitting between N holders must not lose hours to rounding. |
| C7 | A step assigned to a holder of the supervising role generates **zero** supervision (FR-051). |
| C8 | An unassigned step generates no supervision and no effort figure — only plan days. No assignee means no level to apply. |
| C9 | An unknown seniority resolves to `NEUTRAL`, never a throw. |
| C10 | `utilisationPct` is `null` when available hours are 0. Never `Infinity`, `NaN`, or a misleading `0`. |
| C11 | A step with `done: true` never appears in `daysOpen`, `stepsOpen`, `overdueCount` or `oldestOverdue`, whatever its date — but **does** count toward consumed hours. |
| C12 | A step with `dueDate: null` contributes to `planDays` and `undatedPlanDays`, and to **no** month. |
| C13 | Brand rollups use plan days only — seniority never moves a brand figure (FR-036). |
| C14 | Ordering is deterministic: brands by plan days desc then name; capacity rows by effort days desc, with `unassigned` and `supervision-unowned` always last. |
| C15 | Empty input returns empty arrays and zeroed totals — never a throw, never `NaN`. |
| C16 | Pure: same inputs, same output, no clock read. `today` is always passed in. |

---

## 2. Server actions

Three actions. **Every one of them must call `requireAdmin()` first and return its error unchanged.** There is no RLS behind any of them; that call is the entire permission gate, and a missing one is a privilege escalation, not a style problem.

### `updateWorkloadAssumptions` — `src/actions/settings.ts`

```ts
(patch: {
  hoursPerStepDay?: number
  capacityPeriodEnd?: string | null
  complexityThresholdDays?: number
  supervisingRole?: string
}) => Promise<{ success: boolean; error?: string }>
```

Validates `hoursPerStepDay` in `1..24` and `complexityThresholdDays` in `0..60`, rejecting non-finite values; `capacityPeriodEnd` as `YYYY-MM-DD` or null. A past end date is accepted — the period is then empty and the panel says so — but MUST NOT yield a negative working-day count. Upserts `workspace_settings` id 1, matching `updateWeeklyCapacity`. Revalidates `/projects` and `/settings`.

### `updateSeniorityLevel` — `src/actions/settings.ts`

```ts
(key: string, patch: { effortFactor?: number; supervisionRate?: number })
  => Promise<{ success: boolean; error?: string }>
```

Validates `effortFactor` in `0.1..5` and `supervisionRate` in `0..2`. Rejects an unknown key rather than creating a level. Revalidates `/projects` and `/settings`.

### Extensions to existing actions

| Action | Change |
|---|---|
| `updateStep` (`projects.ts`) | Accepts `milestone?: boolean` and `complexity?: 'simple' \| 'complex' \| null`. Keeps its existing rule: admin, **or** the step's assignee. |
| `updateMember` (`members.ts`) | Accepts `seniority?: string`, validated against the known level keys. Admin only, as today. |

---

## 3. Component props

### `WorkloadPanel`

```ts
interface WorkloadPanelProps {
  projects: ProjectView[]          // already filtered by the board's Focus/Aspiring toggle
  members:  MemberInput[]
  brands:   { id: string; name: string; color: string; logo_url?: string | null }[]
  settings: { hoursPerStepDay: number; capacityPeriodEnd: string | null
              complexityThresholdDays: number; supervisingRole: string }
  levels:   Record<string, LevelRates>
  isAdmin:  boolean
  today:    string
}
```

- Renders the assumption header as read-only text when `isAdmin` is false (FR-022).
- Receives `projects` **already filtered** — must not re-apply the Focus/Aspiring rule.

### `PersonWorkloadCard`

```ts
interface PersonWorkloadCardProps {
  load: PersonLoad
  color?: string        // defaults to personColor(name)
  compact?: boolean     // team-board rendering of one's own card
}
```

Presentational only. All arithmetic arrives done, so the team board and the Workload tab cannot produce different numbers for the same person. `load.steps === 0` renders the empty state (FR-020), not a zero-filled card.

### `WorkloadSettings`

Renders the four scalars and one row per seniority level. Every control states the unit and the effect; no rate is shown without its meaning.

---

## 4. The "shows its workings" contract

FR-044 requires an adjusted figure to be inspectable. Wherever `effortDays ≠ planDays`, the UI MUST make all of the following reachable without leaving the panel:

1. the plan days behind it,
2. the split of simple vs complex days,
3. the factor applied and the level it came from,
4. any supervision received, and — when shared — the split (FR-049).

A number that cannot show its workings is indistinguishable from a number that is wrong.

---

## 5. Rendering contract

Straight from `src/lib/board-ui.ts`; no new colour literals (Constitution §I).

| Element | Source |
|---|---|
| Card surface, border, radius | `card` |
| Selects and controls | `control`, `input` |
| Eyebrow, title, KPI label/value | `font.*` |
| KPI tile tints | `TILE.*` |
| Over-capacity emphasis | `UI.redStrong` |
| Under-capacity bar fill | `UI.limeDot`, or the row's `personColor(name)` |
| Neutral bar track | `UI.track` |
| Consumed-hours fill | `UI.limeDot` on `UI.track` |
| Milestone marker | `UI.star` |
| Unassigned / undated / unowned-supervision rows | `UI.soft` on `UI.groupBg` — visibly present, visibly not a person |
| Supervision component within a row | `UI.purple`, distinct from the person's own work |

A bar's rendered width clamps at 100% while its label reports the true percentage (FR-015). With a 1.8 factor on an already-overloaded plan, honest utilisation runs far past the end of the track.
