# Phase 1 Contracts: Projects Workload

**Feature**: `specs/004-projects-workload` | **Date**: 2026-08-12

Three interfaces: the calculation module, the server action, and the component props. The module is the important one — it is what stops the two new surfaces disagreeing with each other and with the four tabs already on the board.

---

## 1. Calculation module — `src/lib/workload.ts`

Pure. **Imports neither React nor Prisma**, exactly like `src/lib/projects.ts`, so it can be exercised directly against `data/projects-plan.json` with `tsx`.

```ts
import type { ProjectView } from '@/lib/projects'

export interface WorkloadAssumptions {
  hoursPerStepDay: number
  periodStart: string      // ISO, always today
  periodEnd: string        // ISO
  workingDays: number
}

export interface MemberInput {
  id: string
  name: string
  role: string
  capacityHrsWk: number
  avatarUrl?: string | null
}

/**
 * Resolve the period. `end` null → the last dated step in `projects`;
 * if nothing is dated, the period is empty and workingDays is 0.
 */
export function assumptionsOf(
  projects: ProjectView[],
  today: string,
  hoursPerStepDay: number,
  end: string | null,
): WorkloadAssumptions

/** Brand rollup, heaviest first; unbranded projects group under UNASSIGNED. */
export function brandLoads(
  projects: ProjectView[],
  a: WorkloadAssumptions,
): BrandLoad[]

/**
 * One row per member holding load, plus a single `kind: 'unassigned'` row.
 * The unassigned row is present whenever unassigned days > 0 and carries
 * availableHours = 0 and utilisationPct = null.
 */
export function capacityRows(
  projects: ProjectView[],
  members: MemberInput[],
  a: WorkloadAssumptions,
): CapacityRow[]

/** One person in depth, including the months they span and their undated days. */
export function personLoad(
  projects: ProjectView[],
  member: MemberInput,
  a: WorkloadAssumptions,
  today: string,
): PersonLoad

/** Weekdays in `month` ('YYYY-MM'), clipped to [periodStart, periodEnd]. */
export function workingDaysInMonth(month: string, a: WorkloadAssumptions): number
```

### Behavioural guarantees

| # | Guarantee |
|---|---|
| C1 | `Σ capacityRows[].days === Σ projects[].steps[].durationDays`. Every step-day lands in exactly one row. |
| C2 | `Σ personLoad.months[].days + personLoad.undatedDays === personLoad.days` |
| C3 | `utilisationPct` is `null` when available hours are 0. Never `Infinity`, `NaN` or a misleading `0`. |
| C4 | A step with `done: true` never appears in `daysOpen`, `stepsOpen`, `overdueCount` or `oldestOverdue`, whatever its date. |
| C5 | A step with `dueDate: null` contributes to `days` and to `undatedDays`, and to **no** month. |
| C6 | Ordering is deterministic: brands by days desc then name; capacity rows by days desc, with the unassigned row always last. |
| C7 | Empty input returns empty arrays and zeroed totals — never a throw, never `NaN`. |
| C8 | The functions are pure: same inputs, same output, no clock read. `today` is always passed in. |

---

## 2. Server action — `src/actions/settings.ts`

```ts
export async function updateWorkloadAssumptions(patch: {
  hoursPerStepDay?: number
  capacityPeriodEnd?: string | null
}): Promise<{ success: boolean; error?: string }>
```

**Contract**:

1. **MUST call `requireAdmin()` first and return its error unchanged.** There is no RLS behind this; this call is the entire permission gate. A missing check here is a privilege escalation, not a style problem.
2. Validates `hoursPerStepDay` in `1..24`; rejects `NaN` and non-finite values.
3. Validates `capacityPeriodEnd` as `YYYY-MM-DD` or null. A date in the past is accepted — the period is then empty and the panel says so — but MUST NOT produce a negative working-day count.
4. Persists via `prisma.workspaceSettings.upsert({ where: { id: 1 }, … })`, matching `updateWeeklyCapacity`.
5. Calls `revalidatePath('/projects')` and `revalidatePath('/settings')`.
6. Returns `{ success: false, error }` on failure — never throws to the client.

---

## 3. Component props

### `WorkloadPanel`

```ts
interface WorkloadPanelProps {
  projects: ProjectView[]      // already filtered by the board's Focus/Aspiring toggle
  members:  MemberInput[]
  brands:   { id: string; name: string; color: string; logo_url?: string | null }[]
  hoursPerStepDay: number
  capacityPeriodEnd: string | null
  isAdmin: boolean             // controls the assumption editors only; the tab is already gated
  today: string
}
```

- Renders the assumption header as read-only text when `isAdmin` is false (FR-022).
- Receives `projects` **already filtered**; it must not re-apply the Focus/Aspiring rule (research R4).

### `PersonWorkloadCard`

```ts
interface PersonWorkloadCardProps {
  load: PersonLoad
  color?: string               // defaults to personColor(name) from board-ui
  compact?: boolean            // team-board rendering of one's own card
}
```

- Presentational only. All arithmetic arrives done, so the team board and the Workload tab cannot produce different numbers for the same person.
- `load.steps === 0` renders the empty state (FR-020), not a zero-filled card.

---

## 4. Rendering contract

Straight from `src/lib/board-ui.ts`; no new colour literals (Constitution §I).

| Element | Source |
|---|---|
| Card surface, border, radius | `card` |
| Selects and controls | `control`, `input` |
| Eyebrow, title, KPI label/value | `font.*` |
| KPI tile tints | `TILE.*` |
| Over-capacity emphasis | `UI.redStrong` |
| Under-capacity bar fill | `UI.limeDot`, or the row's own `personColor(name)` |
| Neutral bar track | `UI.track` |
| Unassigned / undated rows | `UI.soft` on `UI.groupBg` — visibly present, visibly not a person |

A bar's rendered width clamps at 100% while its label keeps reporting the true percentage (FR-015). At 276 planned days against ~94 available, the honest number is far past the end of the track.
