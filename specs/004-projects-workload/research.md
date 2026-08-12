# Phase 0 Research: Projects Workload

**Feature**: `specs/004-projects-workload` | **Date**: 2026-08-12 (rewritten post-clarification)

Every open technical question, resolved against the code and data as they are. Figures were computed from `data/projects-plan.json` and the live schema, not estimated.

---

## R1 — Where the new settings live

**Decision**: Split by shape. **Scalars** go on the existing `WorkspaceSettings` singleton; the **per-level rates** get their own small table.

| Setting | Home |
|---|---|
| `hours_per_step_day` (default 8) | `WorkspaceSettings` |
| `capacity_period_end` (nullable) | `WorkspaceSettings` |
| `complexity_threshold_days` (default 3) | `WorkspaceSettings` |
| `supervising_role` (default `Marketing Manager`) | `WorkspaceSettings` |
| effort factor and supervision rate, per level | **new `SeniorityLevel` table**, 3 seeded rows |

**Rationale**: The first four are single values and belong beside `capacity_hrs_per_wk`, which is exactly the same kind of knob; `src/actions/settings.ts` already has a working `upsert({ where: { id: 1 } })` with `requireAdmin()` to copy.

The per-level rates are different: they are a *list* with two numbers each, the settings UI has to render and edit them row by row, and the user's own phrasing (`level > 1`) implies an ordered scale that could gain a rung. Encoding that as six columns — `junior_factor`, `junior_rate`, `mid_factor`, … — models a list as columns, cannot gain a level without a migration, and gives the UI nothing to iterate over.

**Resilience**: `Member.seniority` stays a plain string with a default rather than a hard foreign key. A missing level row resolves to factor 1.0 / rate 0 — the neutral value — so a bad settings edit degrades to "no adjustment" rather than a page that will not render.

**Alternatives considered**:
- *All ten values on the singleton* — rejected as above.
- *A table for everything, including the scalars* — rejected; a one-row-per-key key/value table loses type safety and turns four typed columns into string parsing.
- *Hardcoded rates* — rejected outright by FR-040.

---

## R2 — The effort and supervision calculation

**Decision**: Implement the user's rule literally, per step, in this order:

```
simple      = duration ≤ complexity_threshold  (unless the step overrides it)
adjusted    = isSimple ? duration : duration × factor(assignee.level)
supervision = isSimple ? 0 : adjusted × rate(assignee.level)

person.planDays   = Σ duration
person.effortDays = Σ adjusted   (+ supervision received, if they hold the supervising role)
```

**Rationale**: Two properties of the rule are easy to get wrong and both change the answer materially.

1. **The factor applies only to complex steps.** `effort = simple + (complex × factor)`, not `total × factor`. At today's default threshold that is the difference between 625d and 767d for a wholly-junior team — a 23% error.
2. **Supervision compounds off `adjusted`, not `duration`.** With factor 1.8 and rate 25%, supervision is 45% of the planned duration, not 25%. Computing it off `duration` understates it by nearly half.

Order of operations is therefore fixed, not incidental, and is stated as a contract guarantee.

**Validation**: with the video editor as the only junior and the threshold at 3 days, her 33 complex days give `33 × 1.8 × 0.25 = 14.8d` of supervision against the mock's `16d` — the same drift every other figure shows, since the plan was edited after the mock was drawn.

**Alternatives considered**:
- *Factor across all of a person's days* — rejected; contradicts `!isSimple(step)` in the rule as given.
- *Supervision as a flat % of a person's total* — rejected; it was one of the readings the clarification ruled out, and it cannot distinguish a person doing many simple steps from one doing few hard ones.

---

## R3 — Step complexity, which the data does not have

**Decision**: A configurable duration threshold, defaulting to **3 days**, with a nullable per-step override that survives threshold changes.

**Rationale**: The rule needs a simple/complex distinction; nothing in the schema supplies one. Requiring all 327 steps to be tagged before the panel works would ship a feature that is useless on arrival.

A threshold works because duration is already a proxy for difficulty in this plan. Sensitivity, over the 426 Focus step-days:

| Threshold | Simple | Complex |
|---|---|---|
| ≤1d | 19d (4.5%) | 407d (95.5%) |
| ≤2d | 129d (30.3%) | 297d (69.7%) |
| **≤3d** | **177d (41.5%)** | **249d (58.5%)** |
| ≤4d | 209d (49.1%) | 217d (50.9%) |
| ≤5d | 334d (78.4%) | 92d (21.6%) |

3 days is chosen as the default because it splits the plan closest to evenly without being on a cliff — the jump from 4d to 5d moves 125 days across in one step, so a default there would be unstable under small edits. It is also the value that reproduces the mock's supervision figure.

The override is nullable and takes precedence, so correcting a misclassified step is a local act that is not silently undone when someone tunes the threshold.

**Alternatives considered**:
- *Explicit flag only, no threshold* — rejected; 327 steps of manual tagging before any value is delivered.
- *Threshold only, no override* — rejected; a two-day step can be genuinely hard, and with no escape hatch the only fix is to lie about its duration, which corrupts every other figure.
- *Infer from the step name* — rejected for the same reason milestone inference was rejected: silent breakage on rename.

---

## R4 — Unassigned, undated, and who supervises

**Decision**: All three are first-class in the return types, never filtered.

**Rationale**: Measured against the live plan, 391 of 960 step-days (41%) have no assignee, and 30 of Samaa's 164 days have no due date. Dropping either reports the team at 59% of its real load — a number worse than none, because it looks authoritative.

Three specific consequences of the new rules:

- **Unassigned steps generate no supervision.** No assignee means no level means no rate. Correct, and worth stating: unassigned complex work costs nobody anything until it is given to someone, which is itself the argument for assigning it.
- **Unassigned days are plan days with no effort figure.** They carry no factor because no one has been chosen to do them. Showing an effort number would invent an allocation.
- **Supervision with no supervisor still shows** (FR-050). If nobody holds the supervising role, the overhead appears unattributed. Work that needs supervising and has no supervisor is a finding, not a rounding error.

**Alternatives considered**:
- *Filter to assigned/dated only* — rejected; confidently wrong.
- *Apply an average factor to unassigned work* — rejected; invents both an assignee and their seniority.
- *Drop supervision when the role is vacant* — rejected; hides exactly the condition worth surfacing.

---

## R5 — Reconciliation once the numbers stop adding up

**Decision**: Carry `planDays` and `effortDays` as separate fields everywhere. Reconciliation asserts on plan days; utilisation is computed on effort days.

**Rationale**: Before the clarification, `Σ rows = portfolio total` held, and that invariant was the panel's main defence — it is the property that catches a step-day being double-counted or lost, which is the class of bug that makes a dashboard confidently wrong.

Multipliers and supervision break it by design. Rather than lose the check, the module keeps both quantities. The old contract guarantee C1 is restated against `planDays`, and a new guarantee covers the relationship between them: `effortDays ≥ planDays` for any member whose factor is ≥ 1, with equality when all their work is simple.

**Alternatives considered**:
- *Keep only effort days* — rejected; no way left to prove nothing was lost.
- *Keep only plan days and show factors as annotation* — rejected; makes utilisation a lie, and the whole point of the seniority answer was that it changes the maths.
- *Reconcile effort against a "total effort" figure* — rejected; that total is itself derived from the same assumptions, so the check would be circular and would pass while both sides were wrong.

---

## R6 — Constitution drift

**Decision**: Follow the code. Record the drift; do not plan to Supabase, RLS or Zustand.

**Rationale**: Constitution 2.0.0 names Supabase Auth, Postgres RLS, Zustand and Vercel. The repository has Prisma, a custom HMAC session, no RLS, no Zustand, and deploys to Cranl. Planning to the written constitution would produce an unimplementable plan.

Consequences for this feature: **§III's DB-level enforcement is unavailable**, so `requireAdmin()` in each of the three new actions is the whole gate; **§I's token map is not what the boards use**; **§VI's Zustand rule is moot** but its intent is honoured.

One genuinely new question, raised by FR-048: the constitution fixes review-stage ownership by role, with Marketing Manager owning `c-final` and `final-check`. Supervision defaulting to the same role is consistent with that rather than competing with it — it is the person the constitution already puts on review duty. Keeping the role **configurable** rather than hardcoded avoids creating a second ownership table that could drift from §II's.

**Recommended follow-up (not this feature)**: amend the constitution to 3.0.0 describing Prisma, the custom session, the absence of RLS and the two-palette reality. Until then, every plan re-litigates this.

---

## R7 — Verification without a test runner

**Decision**: Typecheck, production build, Playwright against local PostgreSQL, and a `tsx` reconciliation harness against the pure module.

**Rationale**: The arithmetic is now five inputs deep and is the part most worth checking and least suited to a browser. Because `workload.ts` imports neither React nor Prisma, it runs directly against `data/projects-plan.json`.

Properties worth asserting, all of which survive the new rules:

1. `Σ capacityRows.planDays` (members + unassigned) `= portfolio total plan days`
2. For any person, `Σ months.planDays + undatedPlanDays = person.planDays`
3. `effortDays ≥ planDays` wherever factor ≥ 1, with equality when all work is simple
4. Total supervision generated = total supervision received (nothing lost when split between role-holders, nothing invented when there are none)
5. No `NaN`, `Infinity` or negative working-day count anywhere

Property 4 is new and is the one most likely to break: splitting a figure between N holders and rounding each share is where hours quietly disappear.

**Alternatives considered**:
- *Introduce Vitest* — right long-term answer, rejected as scope creep here.
- *Browser assertions only* — rejected; none of the five properties above is visible on screen.

---

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Where seven new settings persist | R1 — scalars on the singleton, per-level rates in a new table |
| Exact effort and supervision formula | R2 — literal to the rule; factor on complex steps only, supervision off `adjusted` |
| What makes a step complex | R3 — threshold default 3d, with a per-step override |
| Unassigned / undated / vacant supervisor | R4 — all first-class, none filtered |
| How to keep reconciliation once effort ≠ plan | R5 — carry both; assert on plan, measure on effort |
| Which constitution applies | R6 — follow the code; drift recorded |
| Verification without a test runner | R7 — typecheck, build, Playwright, `tsx` harness on five properties |

No `NEEDS CLARIFICATION` markers remain.
