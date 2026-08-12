# Phase 1 Data Model: Projects Workload

**Feature**: `specs/004-projects-workload` | **Date**: 2026-08-12 (rewritten post-clarification)

Mostly still a read model. Four existing entities supply the figures; three gain fields, and one small table is added.

---

## Existing entities — read only, unchanged

### Project

| Field | Used for |
|---|---|
| `brand_id` | Brand grouping; null → the unbranded group (7 projects today) |
| `focus` | Scope — the panel follows the board's toggle |
| `standing`, `due_date` | Not used. A project's date is not its steps' dates. |

### Brand

`name`, `color`, `logo_url` — row identity, rendered as the Projects board already renders brand headers.

---

## Modified entities

### ProjectStep — gains two fields

The atom of every figure. Every number is a fold over these rows.

| Field | Type | Used for |
|---|---|---|
| `duration_days` | `Decimal(5,1)` | The unit of load. **Arrives as a Prisma `Decimal`** — convert once at the boundary. Halves occur. |
| `due_date` | `Date?` | Places a step in a month; decides overdue. Null on ~18% of one person's days. |
| `assignee_id` | `String?` | Which capacity row the load lands in, and whose seniority applies. Null on 41% of step-days. |
| `done` | `Boolean` | Excludes from "still open" and overdue; **includes** in consumed hours. Does not exclude from planned. |
| **`milestone`** | `Boolean` **default false** | FR-028. Seeded by the importer from marker names; never overwritten on an existing step. |
| **`complexity`** | `String?` **default null** | FR-045/046. `'simple'` / `'complex'` when overridden; null means the threshold decides. Deliberately nullable so an override survives a threshold change. |

### Member — gains one field

| Field | Used for |
|---|---|
| `name`, `role` | Row label and subtitle. **`role` also selects the supervisor** (FR-048). |
| `capacity_hrs_wk` | The denominator. `/5` for a daily rate; varies 20–40 in live data. |
| `avatar_url` | Optional row avatar. |
| **`seniority`** | `String` **default `'mid'`** — FR-033. A plain string, not a foreign key: see "Resilience" below. |

### WorkspaceSettings — singleton `id = 1`, gains four columns

| Field | Type | Default | Meaning |
|---|---|---|---|
| `capacity_hrs_per_wk` | `Int` | 40 | *existing* |
| `nine_stage_default` | `Boolean` | false | *existing* |
| **`hours_per_step_day`** | `Decimal(4,1)` | 8 | One planned step-day in hours. Range 1–24. |
| **`capacity_period_end`** | `Date?` | null | Null → run to the last dated step in scope. |
| **`complexity_threshold_days`** | `Decimal(4,1)` | 3 | At or below → simple, unless the step overrides. |
| **`supervising_role`** | `String` | `Marketing Manager` | Whose row receives supervision overhead. |

The period **start** is always today and is never stored — a stored start goes stale silently and inflates everyone's available hours the longer nobody looks.

---

## New entity

### SeniorityLevel

Three seeded rows. A list, not a set of columns — see research R1.

| Field | Type | Notes |
|---|---|---|
| `key` | `String @id` | `'junior'` \| `'mid'` \| `'senior'` |
| `label` | `String` | Display name |
| `effort_factor` | `Decimal(4,2)` | Multiplies **complex** step durations only |
| `supervision_rate` | `Decimal(4,2)` | Share of *adjusted* days that becomes supervision |
| `sort_order` | `Int` | Display order |

Seeded defaults (FR-034):

| key | label | effort_factor | supervision_rate |
|---|---|---|---|
| `junior` | Junior | **1.80** | **0.25** |
| `mid` | Mid | 1.00 | 0.00 |
| `senior` | Senior | 1.00 | 0.00 |

**Resilience**: `Member.seniority` is a plain string with a default rather than a hard FK. A member whose level has no row resolves to factor 1.0 / rate 0 — the neutral value — so a bad settings edit degrades to "no adjustment" rather than an unrenderable page.

---

## Derived types — `src/lib/workload.ts`, no persistence

Full signatures in [contracts/workload.md](./contracts/workload.md).

### `WorkloadAssumptions`

```
hoursPerStepDay | periodStart (today) | periodEnd | workingDays
complexityThresholdDays | supervisingRole
levels: Record<string, { effortFactor, supervisionRate }>
```

### `StepCost` — one step, priced

```
planDays | isSimple | adjustedDays | supervisionDays
```

`isSimple` = `step.complexity === 'simple'` if set, else `duration ≤ threshold`. Order matters: the override wins.

### `BrandLoad`

```
brandId | brandName | brandColor
projects | steps | milestones
planDays | doneDays | hours | completionPct
```

`completionPct` = `doneDays ÷ planDays` (FR-008) — the mock's per-brand % column. Brand rollups use **plan** days only: seniority describes how long a person takes, not how much work exists (FR-036).

### `CapacityRow`

```
kind: 'member' | 'unassigned' | 'supervision-unowned'
memberId? | name | role? | seniority?
planDays | effortDays | supervisionReceived | supervisionShare?
hours | availableHours | utilisationPct | over
```

- `effortDays = simpleDays + (complexDays × factor) + supervisionReceived`
- `availableHours = workingDays × (capacity_hrs_wk / 5)`; **zero** on the unassigned and unowned-supervision rows.
- `utilisationPct` is `null` when available hours are 0 — never `Infinity` or `NaN`.
- `supervisionShare` is set only when several members hold the supervising role, and states the split (FR-049).
- `kind: 'supervision-unowned'` appears only when supervision was generated and nobody holds the role (FR-050).

### `PersonLoad`

```
memberId | name | role | seniority
steps | stepsOpen | planDays | effortDays | daysOpen | hours
overdueCount | oldestOverdue
months: MonthLoad[] | undatedPlanDays
```

### `MonthLoad`

```
month ('YYYY-MM') | label | planDays | effortDays
workingDays | utilisationPct | over
```

---

## Invariants

Asserted by the reconciliation harness (research R7, [quickstart.md](./quickstart.md)):

1. **Plan days reconcile.** `Σ capacityRows.planDays` (members + unassigned) `= portfolio total plan days`. No step-day counted twice or lost. **This holds on plan days only** — effort days are not expected to reconcile, and asserting on them would be wrong.
2. **A person reconciles.** `Σ months.planDays + undatedPlanDays = person.planDays`.
3. **Effort never undercuts plan.** `effortDays ≥ planDays` wherever the factor ≥ 1, with equality when all of a person's work is simple.
4. **Supervision is conserved.** Total generated = total received. Nothing lost to rounding when split between role-holders; nothing invented when there are none — it lands on the unowned row instead.
5. **Nobody supervises themselves.** Steps assigned to a holder of the supervising role generate zero supervision (FR-051).
6. **Done never counts as open.** `daysOpen ≤ planDays`; a done step is never overdue whatever its date.
7. **Percentages are guarded.** `utilisationPct` is `null` — never `Infinity`, `NaN` or a misleading `0` — when the denominator is 0.
8. **Decimals stay decimal.** Converted once at the boundary; display rounds, arithmetic does not. A factor of 1.8 on halves yields values like 3.6; rounding those before summing breaks invariant 1.
9. **Scope is uniform.** Every figure comes from the same filtered project array the rest of the board is showing.

---

## Not modelled

| Not modelled | Why |
|---|---|
| Time tracking / hours worked | Out of scope. "Consumed hours" is done step-days valued in hours, not tracked time. |
| Deliverables and "posts" | Dropped by decision, though derivable via `ProjectStep.task_id`. |
| Milestone dependencies or gating | A milestone is a marked step, not a phase boundary. |
| Public holidays | No holiday data anywhere in the product (FR-025). |
| Per-member factor overrides | Rates are per level, not per person. A member who is an exception should have their level changed. |
