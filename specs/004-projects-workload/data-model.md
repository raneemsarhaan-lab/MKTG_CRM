# Phase 1 Data Model: Projects Workload

**Feature**: `specs/004-projects-workload` | **Date**: 2026-08-12

This feature is overwhelmingly a read model. Four existing entities supply every figure; one existing entity gains two columns. Nothing else is persisted.

---

## Existing entities (read only — unchanged)

### ProjectStep

The atom of this feature. Every number in the panel is a fold over these rows.

| Field | Type | Used for |
|---|---|---|
| `duration_days` | `Decimal(5,1)` | The unit of load. **Arrives as a Prisma `Decimal`, not a number** — must go through `Number(...)`, as `projects/page.tsx` already does. Halves (`0.5`) occur. |
| `due_date` | `Date?` | Places a step in a month, and decides overdue. Null on ~18% of one person's days — see undated handling. |
| `assignee_id` | `String?` → Member | Which capacity row the load lands in. Null on 41% of all step-days. |
| `done` | `Boolean` | Excludes a step from "still open" and from overdue. Does **not** exclude it from "planned". |
| `project_id` | → Project | Reaches brand and Focus flag. |

### Project

| Field | Used for |
|---|---|
| `brand_id` | Brand grouping; null → the unbranded group (7 projects today) |
| `focus` | Scope selection — the panel follows the board's toggle |
| `standing` | Not used by this feature; standing projects count like any other |
| `due_date` | Not used — a project's date is not its steps' dates |

### Member

| Field | Used for |
|---|---|
| `name`, `role` | Row label and subtitle |
| `capacity_hrs_wk` | The denominator. Divided by 5 for a daily rate; varies 20–40 in live data |
| `avatar_url` | Optional row avatar |

### Brand

`name`, `color`, `logo_url` — row identity. Reused exactly as the Projects board already renders brand headers.

---

## Modified entity

### WorkspaceSettings (singleton, `id = 1`)

Two columns added. Both have defaults, so `prisma db push` needs no backfill and existing rows stay valid.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `capacity_hrs_per_wk` | `Int` | 40 | *existing* |
| `nine_stage_default` | `Boolean` | false | *existing* |
| **`hours_per_step_day`** | `Decimal(4,1)` | **8** | One planned step-day, in hours. Range 1–24. |
| **`capacity_period_end`** | `Date?` | **null** | End of the capacity window. Null → run to the last dated step in scope. |

The period **start** is always today. It is not stored: a stored start would silently go stale and quietly inflate everyone's available hours the longer nobody looked at it.

---

## Derived types (no persistence — `src/lib/workload.ts`)

These are the module's contract. Full signatures in [contracts/workload.md](./contracts/workload.md).

### `WorkloadAssumptions`

```
hoursPerStepDay: number     // from settings, default 8
periodStart:     string      // today, ISO
periodEnd:       string      // settings, or the last dated step in scope
workingDays:     number      // businessDaysBetween(start, end)
```

### `BrandLoad` — one per brand, plus one for unbranded

```
brandId | brandName | brandColor | projects | steps | days | hours | sharePct
```

`sharePct` is share of the portfolio's planned days, not of hours — the two are the same ratio, and days are the measured quantity.

### `CapacityRow` — one per member with load, plus one unassigned

```
kind: 'member' | 'unassigned'
memberId? | name | role? | days | hours | availableHours | utilisationPct | over: boolean
```

- `availableHours = workingDays × (capacity_hrs_wk / 5)`; **zero for the unassigned row** — nobody is available to do it.
- `utilisationPct` is `null` when `availableHours` is 0, never `Infinity` or `NaN`. The unassigned row shows days and hours with no percentage, which is the honest rendering.
- `over` is `utilisationPct !== null && utilisationPct >= 100`.

### `PersonLoad` — one person, in depth

```
memberId | name | role
steps | stepsOpen | days | daysOpen | hours
overdueCount | oldestOverdue: string | null
months: MonthLoad[]
undatedDays: number
```

### `MonthLoad`

```
month: string        // 'YYYY-MM'
label: string        // 'Aug'
days: number
workingDays: number  // weekdays in that month, clipped to the period
utilisationPct: number | null
over: boolean
```

---

## Invariants

These are the properties worth asserting, and the ones the reconciliation harness checks (research R6):

1. **Capacity reconciles.** `Σ capacityRows.days` (members + unassigned) `= portfolio total planned days`. No step-day may be counted twice or lost.
2. **A person reconciles.** For any member, `Σ months.days + undatedDays = person.days`.
3. **Done never counts as open.** `daysOpen ≤ days`, and a done step is never overdue regardless of its date.
4. **Percentages are guarded.** `utilisationPct` is `null` — never `Infinity`, `NaN` or `0` — whenever the denominator is 0.
5. **Decimals stay decimal.** Sums are computed on numbers converted once at the boundary; display rounds, arithmetic does not.
6. **Scope is uniform.** Every figure on the panel is computed from the same filtered project array the rest of the board is showing.

---

## What is deliberately not modelled

Per spec D1 and FR-027, with the reason each was excluded:

| Not modelled | Why |
|---|---|
| Consumed hours | No time tracking exists; nothing records hours worked |
| Milestones | No milestone concept on projects or steps |
| Deliverables / posts | The join from a brand's pipeline tasks to its projects is undefined |
| Seniority | Members have a role, not a level |
| Supervision overhead | No rule exists that adds review time to a manager's load |
| Public holidays | No holiday data anywhere in the product (FR-025) |
