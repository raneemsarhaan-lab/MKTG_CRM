# Tasks: Projects Workload — per team member and per brand

**Input**: Design documents from `/specs/004-projects-workload/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md) (54 FRs), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/workload.md](./contracts/workload.md), [quickstart.md](./quickstart.md)

**Tests**: No test runner is configured in this repository. Verification is a `tsx` reconciliation harness over the pure module, plus typecheck, build and a browser pass — see [quickstart.md](./quickstart.md). The harness is a real task (T012), not optional: five of its properties are invisible on screen.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an unfinished task
- **[Story]**: US1 / US2 / US3, matching the user stories in spec.md

## Path Conventions

Single Next.js application. Source under `src/`, Prisma under `prisma/`, importers under `scripts/`.

## How the stories split

The panel is useful before any assumption is configurable, which is what makes US1 a real MVP. Every member defaults to seniority `mid` (factor 1.0, supervision 0%), so on first deploy **effort days equal plan days** and the panel is a straight, honest rollup. US3 is what makes them diverge.

The module must carry both quantities from the start regardless (Phase 2), or US3 would rewrite US1's types rather than extend them.

---

## Phase 1: Setup — schema and data

**Purpose**: Everything the module needs to exist before it can be written or run against real data.

- [X] T001 Add the `SeniorityLevel` model to `prisma/schema.prisma` — `key` String @id, `label`, `effort_factor` Decimal(4,2), `supervision_rate` Decimal(4,2), `sort_order` Int, mapped to `seniority_levels`
- [X] T002 Add `milestone` Boolean @default(false) and `complexity` String? to `ProjectStep` in `prisma/schema.prisma`
- [X] T003 Add `seniority` String @default("mid") to `Member` in `prisma/schema.prisma` — a plain string, **not** a foreign key, so an unknown level degrades to neutral rather than an unrenderable page (data-model "Resilience")
- [X] T004 Add `hours_per_step_day` Decimal(4,1) @default(8), `capacity_period_end` Date?, `complexity_threshold_days` Decimal(4,1) @default(3) and `supervising_role` String @default("Marketing Manager") to `WorkspaceSettings` in `prisma/schema.prisma`
- [X] T005 Run `prisma db push --accept-data-loss --skip-generate` then `prisma generate --no-hints` against the local database; confirm every addition carries a default so no backfill is required
- [X] T006 [P] Seed the three seniority rows in `prisma/seed.ts` — junior 1.80/0.25, mid 1.00/0.00, senior 1.00/0.00 — using `upsert` with an empty `update`, so an admin's edited rates survive every container restart
- [X] T007 [P] Seed `ProjectStep.milestone` in `scripts/import-plan.ts` from the marker-name convention (`GO LIVE`, `LAUNCH`, `ENROLMENT OPENS`, `CAMPAIGN CLOSES`, `SERIES RUNS`, `DELIVERED …`), applied **only to steps being created** — never to a step that already exists (FR-030)

**Checkpoint**: `prisma db push` reports a change; `scripts/migrate.sh` runs clean end to end.

---

## Phase 2: Foundational — the calculation module

**Purpose**: One place where every figure is derived. Blocks all three stories: the panel, the person card and the settings all read from here.

**⚠️ No UI task may start until T012 passes.**

- [X] T008 Create `src/lib/workload.ts` with the types from contracts §1 — `LevelRates`, `WorkloadAssumptions`, `MemberInput`, `BrandLoad`, `CapacityRow`, `PersonLoad`, `MonthLoad`, `NEUTRAL` — importing neither React nor Prisma
- [X] T009 Implement `assumptionsOf()` and `workingDaysInMonth()` in `src/lib/workload.ts` — period start is always today and is never stored; a null end resolves to the last dated step in scope; reuse `businessDaysBetween` from `src/lib/utils.ts` so "working day" means one thing product-wide
- [X] T010 Implement `costOf()` in `src/lib/workload.ts` — **the two traps live here.** `isSimple` prefers `step.complexity` over the threshold (C5); `adjusted = isSimple ? days : days × factor` so the factor touches complex steps only (C4); `supervision = isSimple ? 0 : adjusted × rate` so supervision compounds off the adjusted figure (C3). Computing supervision off `days` understates it by ~44% at the default rates
- [X] T011 Implement `brandLoads()`, `capacityRows()` and `personLoad()` in `src/lib/workload.ts` — including the `unassigned` row, the `supervision-unowned` row (FR-050), the even split across role-holders with `supervisionShare` set (FR-049), self-supervision excluded (C7), unassigned generating no supervision (C8), and `utilisationPct` null rather than `Infinity` when available hours are 0 (C10)
- [X] T012 Write `scripts/check-workload.ts` (scratch harness, not shipped) asserting the five properties from quickstart Validation 1 against `data/projects-plan.json` — plan days reconcile to 960.0 with 391.0 unassigned; a person's months + undated equal their total; effort ≥ plan where factor ≥ 1; **supervision generated = supervision received**; and no `NaN`, `Infinity` or negative working days

**Checkpoint**: `tsx scripts/check-workload.ts` passes all five. Supervision conservation is the one most likely to fail — splitting a figure across N holders and rounding each share is where hours vanish.

---

## Phase 3: User Story 1 — See where the plan's work actually sits (P1) 🎯 MVP

**Goal**: One panel answering "who is overloaded and which brand is eating the plan", without opening a single project.

**Independent test**: Open the Projects board with the current plan. The panel reports 14 Focus projects, four brand rows with project counts 3 / 2 / 8 / 1, and person rows whose plan days total the same 426 as the plan itself. Change one step's duration; the affected brand row and person row both move by that amount.

- [X] T013 [US1] Widen the member select in `src/app/(app)/projects/page.tsx` to include `role`, `seniority` and `capacity_hrs_wk`, and load `workspaceSettings` plus the seniority levels — one query added, no new round trip per row
- [X] T014 [US1] Add `'workload'` to the `Tab` union in `src/components/projects/ProjectsView.tsx` and render the tab button only when `isAdmin` (FR-021), keeping the four existing tabs untouched
- [X] T015 [P] [US1] Build the KPI row in `src/components/projects/WorkloadPanel.tsx` — projects, expected hours, consumed hours with its bar (FR-006a), milestones ahead/passed (FR-006c), and unassigned; tiles and type from `src/lib/board-ui.ts` only
- [X] T016 [P] [US1] Build the brand rollup in `src/components/projects/WorkloadPanel.tsx` — project count, steps, plan days, hours, milestone count and completion % as done-days ÷ total-days (FR-008), heaviest first, brand colour from the brand record
- [X] T017 [US1] Build the capacity rollup in `src/components/projects/WorkloadPanel.tsx` — plan days, effort days, hours, available hours, bar and utilisation; over-capacity rows in `UI.redStrong` with the bar clamped at 100% while the label reports the true figure (FR-013, FR-015)
- [X] T018 [US1] Render the unassigned row in `src/components/projects/WorkloadPanel.tsx` with days and hours but **no percentage** — nobody is available to do it — and visibly not a person (FR-014)
- [X] T019 [US1] Render the assumptions header in `src/components/projects/WorkloadPanel.tsx` — period, working days, hours per person per day, complexity threshold — read-only for non-admins (FR-022, FR-026)
- [X] T020 [US1] Implement the "shows its workings" affordance in `src/components/projects/WorkloadPanel.tsx` per contracts §4 — plan days, simple/complex split, factor and its level, and any supervision, reachable wherever effort ≠ plan (FR-044)
- [X] T021 [US1] Add the empty state to `src/components/projects/WorkloadPanel.tsx` for a scope with no projects, and confirm the panel states which subset it is measuring (FR-002)

**Checkpoint**: The MVP is deliverable here. Brand and capacity rollups are correct and reconcile; effort equals plan because every member is still `mid`.

---

## Phase 4: User Story 2 — See one person's load month by month (P2)

**Goal**: Story 1 says *who* is overloaded; this says *when*. A person at 110% overall may be fine in November and impossible in August.

**Independent test**: Open Samaa. Her card reports 164 plan days, the count still open, the count overdue with the oldest date, and a month list. Move one step from August to November; both months change accordingly.

- [X] T022 [P] [US2] Build `src/components/projects/PersonWorkloadCard.tsx` — name, role, seniority, total steps, plan days, effort days, days open and hours; presentational only, all arithmetic arriving done so the two surfaces cannot disagree
- [X] T023 [US2] Add the overdue tile to `src/components/projects/PersonWorkloadCard.tsx` — count and oldest date in `UI.redStrong`, with zero rendering as a calm state rather than a red zero (FR-017)
- [X] T024 [US2] Add the month list to `src/components/projects/PersonWorkloadCard.tsx` — plan days, working days in that month, percentage, over-capacity months visually distinct; a month with zero working days shows days without a misleading percentage (FR-018)
- [X] T025 [US2] Report undated days separately in `src/components/projects/PersonWorkloadCard.tsx` — Samaa's 30 undated days must be visible, not folded into an arbitrary month (FR-019) — and add the empty state for a person with no assigned steps (FR-020)
- [X] T026 [US2] Wire person selection into `src/components/projects/WorkloadPanel.tsx`, and render a member's own card on `src/components/projects/TeamBoard.tsx` so a non-admin sees their own numbers (FR-021)

**Checkpoint**: Both rollup and per-person views work, and reconcile with each other.

---

## Phase 5: User Story 3 — Change the assumptions behind the numbers (P3)

**Goal**: Make the panel a planning instrument rather than a report. This is also where effort days first diverge from plan days.

**Independent test**: Change effort-per-step-day from 8h to 6h; every hours figure and every utilisation percentage moves in proportion and the header states the assumption. Set a member to junior; their effort rises on complex steps only, and supervision appears on the Marketing Manager's row.

- [X] T027 [US3] Add `updateWorkloadAssumptions` to `src/actions/settings.ts` per contracts §2 — **`requireAdmin()` first**, validating `hoursPerStepDay` 1–24 and `complexityThresholdDays` 0–60, rejecting non-finite values, accepting a past end date without producing a negative working-day count
- [X] T028 [US3] Add `updateSeniorityLevel` to `src/actions/settings.ts` — **`requireAdmin()` first**, validating `effortFactor` 0.1–5 and `supervisionRate` 0–2, rejecting an unknown key rather than creating a level
- [X] T029 [P] [US3] Extend `updateStep` in `src/actions/projects.ts` to accept `milestone` and `complexity`, keeping its existing rule that an admin **or the step's assignee** may edit
- [X] T030 [P] [US3] Extend `updateMember` in `src/actions/members.ts` to accept `seniority`, validated against the known level keys, admin only
- [X] T031 [P] [US3] Build `src/components/settings/WorkloadSettings.tsx` — the four scalars and one row per seniority level, each control stating its unit and effect; no rate shown without its meaning
- [X] T032 [US3] Register the Workload settings section in `src/components/settings/SettingsView.tsx` alongside Brands and SLA, admin-only
- [X] T033 [P] [US3] Add the seniority field to the member row in `src/components/settings/TeamSettings.tsx`, folded into the existing draft so it saves with the row's Save button rather than adding a second save path
- [X] T034 [P] [US3] Add the milestone toggle and complexity override to the step row in `src/components/projects/ProjectsView.tsx` — an overridden step must keep its classification when the threshold later changes (FR-046)
- [X] T035 [US3] Surface the supervision component distinctly in `src/components/projects/WorkloadPanel.tsx` — "112d incl. 16d supervision" (FR-039), the shared split when several hold the role (FR-049), and the unattributed row when nobody does (FR-050)
- [X] T036 [US3] Show the complexity threshold in force and the resulting simple/complex split on the panel (FR-047), since it moves every effort figure

**Checkpoint**: All three stories complete. Every assumption is editable and every adjusted number can show its workings.

---

## Phase 6: Polish & verification

- [X] T037 Re-run `tsx scripts/check-workload.ts` with a non-neutral level configured — the five properties must still hold once effort ≠ plan, especially supervision conservation across role-holders
- [X] T038 [P] Run `npx tsc --noEmit` and `npx next build` clean (retry once if the build exits 144, which this environment does intermittently)
- [X] T039 Work the 24 browser checks in quickstart Validation 3, against a local PostgreSQL — stop the server before rebuilding, or the chunk manifest corrupts and the login form silently falls back to a native GET submit
- [X] T040 Work the 3 edit round-trips in quickstart Validation 4 — duration change, ticking a step done, and reassigning across seniority levels — confirming no manual refresh is needed (SC-004)
- [X] T041 [P] Confirm no colour literal was introduced outside `src/lib/board-ui.ts` (Constitution §I) and that each of the four touched actions carries its own `requireAdmin()` — with no RLS behind them, that call is the entire gate
- [X] T042 **Kept** `scripts/check-workload.ts` deliberately — it is the only automated check of this arithmetic anywhere in the repository, and the properties it asserts (plan days reconciling, supervision conserved) are invisible in the browser. Not wired into any build step; run it with `tsx`.

---

## Dependencies

```
Phase 1 (T001–T007)  schema + seed
        ↓
Phase 2 (T008–T012)  the module — BLOCKS every UI task
        ↓
   ┌────┴────┬──────────────┐
   ↓         ↓              ↓
 US1        US2            US3
(T013–T021) (T022–T026)   (T027–T036)
   ↓         ↓              ↓
   └────┬────┴──────────────┘
        ↓
Phase 6 (T037–T042)  verification
```

**Story independence**: US1 ships alone as the MVP. US2 needs only the module, not US1 — though in practice T026 wires the card into the panel US1 built. US3 needs the module and, for T035/T036, the panel from US1.

**Within Phase 2, order is strict**: T008 (types) → T009 (period) → T010 (per-step cost) → T011 (rollups) → T012 (harness). T010 is the one to get right; T011 only aggregates what it returns.

## Parallel opportunities

| Group | Tasks | Why safe |
|---|---|---|
| Seeding | T006, T007 | Different files (`prisma/seed.ts`, `scripts/import-plan.ts`) |
| US1 sections | T015, T016 | Different sections of the panel, both after T014 |
| US3 actions | T029, T030 | Different action files |
| US3 settings UI | T031, T033, T034 | Three different components |
| Final checks | T038, T041 | Independent reads |

Everything in Phase 2 is sequential — it is one file, and each function builds on the last.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3.** That delivers the thing actually asked for — workload per team member and per brand — with every figure traceable and reconciling. Seniority sits at `mid` for everyone, so effort equals plan and nothing is adjusted; the panel is a straight rollup and correct as such.

**Then Phase 4** for the *when*, which is what makes an overload actionable.

**Then Phase 5**, which is the only phase that makes numbers diverge from the plan. Worth landing last and on its own: it is where a wrong figure would be hardest to spot, because it is the only place the panel stops being a sum of stored data.

## Task count

| Phase | Tasks |
|---|---|
| 1 — Setup | 7 |
| 2 — Foundational | 5 |
| 3 — US1 (P1, MVP) | 9 |
| 4 — US2 (P2) | 5 |
| 5 — US3 (P3) | 10 |
| 6 — Polish | 6 |
| **Total** | **42** |
