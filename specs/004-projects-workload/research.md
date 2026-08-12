# Phase 0 Research: Projects Workload

**Feature**: `specs/004-projects-workload` | **Date**: 2026-08-12

Every open technical question from the plan's Technical Context, resolved against the code and data as they are today. Figures below were computed from `data/projects-plan.json` and the live schema, not estimated.

---

## R1 — Where the workload assumptions live

**Decision**: Two new columns on the existing `WorkspaceSettings` singleton — `hours_per_step_day` (`Decimal(4,1)`, default `8`) and `capacity_period_end` (`Date`, nullable).

**Rationale**: `WorkspaceSettings` is already the one-row table for exactly this kind of workspace-wide knob; it holds `capacity_hrs_per_wk` and `nine_stage_default`, and `src/actions/settings.ts` already has a working `upsert({ where: { id: 1 } })` pattern with `requireAdmin()` that a new action can copy line for line. Adding a table for two scalars would mean a new model, a new access path and a new "what if the row is missing" case, for no gain.

`capacity_period_end` is nullable on purpose: with no end date the period runs from today to the last dated step in scope, which is the behaviour that needs no configuration at all and is right on day one.

**Alternatives considered**:
- *A new `WorkloadSettings` table* — rejected as above.
- *Per-member overrides* — rejected. `Member.capacity_hrs_wk` already varies per person and is the right per-person input; hours-per-step-day is a property of how the plan was estimated, not of a person.
- *Client-side only, in `localStorage`* — rejected. The spec requires the assumption to persist for all viewers (FR-023); a per-browser value would have two admins reading different totals from the same plan.

---

## R2 — How a step-day becomes hours, and what the denominator is

**Decision**: `hours = step_days × hours_per_step_day`, default 8. A person's available hours in a period = `working_days_in_period × (member.capacity_hrs_wk / 5)`.

**Rationale**: The reference header reads "8H PER PERSON PER DAY", so 8 is the default the design assumes; its separate "Effort per step-day 6h" control is the same number made adjustable, which is FR-023. Deriving the daily rate from each member's own `capacity_hrs_wk / 5` rather than a flat 8 matters because the field genuinely varies in this data — the seeded team ranges from 20 to 40 hours a week. Using a flat number would report a half-time person as comfortable when they are drowning.

`businessDaysBetween` in `src/lib/utils.ts` already counts weekdays between two dates and is used by `portfolioStats().runwayDays`. Reusing it keeps "working days" meaning one thing across the product.

**Alternatives considered**:
- *Flat 40h/week for everyone* — rejected; discards real per-member data.
- *Calendar days rather than working days* — rejected; would show every person as comfortably under capacity by inflating the denominator ~40%.
- *Holiday calendar* — out of scope (FR-025). No holiday data exists anywhere in the product, and inventing one is a feature.

---

## R3 — Unassigned and undated work

**Decision**: Both are first-class values in the module's return types, not filtered out. `capacityRows()` returns an `unassigned` bucket alongside the per-person rows; `personLoad()` returns `undatedDays` alongside the month list.

**Rationale**: This is the single most consequential finding of Phase 0. Measured against the live plan:

| | Step-days | Share |
|---|---|---|
| Assigned to a person | 569 | 59% |
| **No assignee** | **391** | **41%** |
| Total | 960 | 100% |

and within one person:

| Samaa | Step-days |
|---|---|
| Dated (falls in a month) | 134 |
| **Undated** | **30** |
| Total | 164 |

A capacity view that quietly drops unassigned work would tell this team it has 59% of the load it actually has — a number worse than no number, because it looks authoritative. Making both values part of the return type means a caller has to decide what to do with them rather than never learning they exist.

**Alternatives considered**:
- *Filter to assigned/dated only* — rejected; produces a confidently wrong answer.
- *Distribute unassigned work evenly across the team* — rejected; invents an allocation nobody made and would move as people are added.
- *Assign undated steps to the project's due month* — rejected; a project due date is not a step due date, and the inference would be invisible in the output.

---

## R4 — Scope: which projects the panel measures

**Decision**: The panel follows the board's existing Focus/Aspiring toggle and states which subset it is showing. Default Focus.

**Rationale**: The mock's "PROJECTS 14" is exactly the count of Focus projects in the live plan, and its four brand rows carry exactly the Focus project counts — 3, 2, 8, 1. That is not a coincidence; it fixes the intended scope beyond doubt. `ProjectsView` already holds `list: 'focus' | 'aspiring'` in state and derives `shown` from it, so the panel receives the same filtered array every other tab does and no second control is needed.

**Verification note**: the mock's *hours* do not reproduce. Its Forefront row of 444h implies 74 step-days where the plan now holds 94; its August figure for Samaa is 38d where the plan now holds 26d. Project counts match and durations do not, which is the signature of a plan whose durations and dates were edited after the mock was drawn — exactly what the user said they would do. **Acceptance must be written against the calculation model, never against the mock's numbers.**

**Alternatives considered**:
- *Always measure all 40 projects* — rejected; contradicts the reference and hides the Focus/Aspiring distinction the board is built around.
- *An independent scope selector on the panel* — rejected; two controls that both filter projects will disagree, and the user will not know which one is in force.

---

## R5 — Constitution drift

**Decision**: Follow the code. Record the drift; do not plan to Supabase, RLS or Zustand.

**Rationale**: Constitution 2.0.0 names Supabase Auth, Postgres RLS, Zustand and Vercel. The repository has Prisma, a custom HMAC session in `src/lib/session.ts`, no RLS, no Zustand, and deploys to Cranl. Planning this feature to the written constitution would produce a plan that cannot be implemented.

Three specific consequences for this feature:
1. **§III's DB-level enforcement is unavailable.** `requireAdmin()` in the server action is the only gate, which is why it is called out separately in the plan's Constraints and gets its own task rather than being assumed.
2. **§I's token map is not what the boards use.** Spec 003 rebuilt both planning boards on `src/lib/board-ui.ts`. The Workload tab must match its neighbours.
3. **§VI's Zustand rule is moot**, but its intent — nothing durable outside Postgres — is honoured.

**Recommended follow-up (not this feature)**: amend the constitution to 3.0.0 describing Prisma, the custom session, the absence of RLS and the two-palette reality. Until then every plan will re-litigate this.

**Alternatives considered**:
- *Amend the constitution as part of this feature* — rejected; a governance change deserves its own review, not a paragraph inside a workload feature.
- *Silently ignore the drift* — rejected; the next planner would hit it again with no record.

---

## R6 — Verification approach

**Decision**: Typecheck, production build, and Playwright against a local PostgreSQL, plus a pure-function harness for `src/lib/workload.ts` run through `tsx`.

**Rationale**: No test runner is configured, and adding one is out of scope. But the arithmetic here is the part most worth checking and the part least suited to a browser: totals must reconcile (SC-002, SC-003), and that is a property, not a pixel. Because `workload.ts` imports neither React nor Prisma, it can be exercised directly against the real `data/projects-plan.json` with `tsx` — fast, and it catches exactly the class of bug that matters.

The two reconciliation properties worth asserting:
- sum of capacity rows + unassigned row = portfolio total step-days
- for any person: sum of month days + undated days = that person's total days

**Alternatives considered**:
- *Introduce Vitest* — rejected as scope creep, though it is the right long-term answer.
- *Browser assertions only* — rejected; would not have caught the 41%-unassigned problem, which is arithmetic, not layout.

---

## Resolved unknowns

| Unknown from Technical Context | Resolution |
|---|---|
| Where workload assumptions persist | R1 — two columns on `WorkspaceSettings` |
| Step-day → hours conversion and capacity denominator | R2 — `× hours_per_step_day`; `working_days × capacity_hrs_wk / 5` |
| Handling of unassigned and undated work | R3 — first-class in return types, never filtered |
| Which projects are in scope | R4 — the board's existing Focus/Aspiring selection |
| Which constitution applies | R5 — follow the code; drift recorded |
| How this is verified without a test runner | R6 — typecheck, build, Playwright, `tsx` harness on the pure module |

No `NEEDS CLARIFICATION` markers remain.
