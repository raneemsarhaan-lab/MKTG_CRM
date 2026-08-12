# Implementation Plan: Projects Workload — per team member and per brand

**Branch**: `004-projects-workload` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-projects-workload/spec.md`

## Summary

Add an admin-only **Workload** tab to the Projects board that rolls the existing plan up two ways — by brand, and by person — and a per-person card showing month-by-month load against the working days each month actually contains.

Technically this is mostly arithmetic over data already loaded by `/projects`. The plan is 40 projects and 327 steps; every figure the spec asks for is a fold over `ProjectStep.duration_days`, `due_date`, `assignee_id` and `done`, grouped by `Project.brand_id` or by `Member`. No new query, no new page load, no new table.

Three things do need building:

1. **`src/lib/workload.ts`** — a pure module holding every calculation, mirroring how `src/lib/projects.ts` already keeps the two boards agreeing with each other. Both the Workload tab and the per-person card read from it, so they cannot drift.
2. **Two persisted assumptions** — hours per step-day, and the end of the capacity period. These go on the existing `WorkspaceSettings` singleton as two columns, not a new table (see research R1).
3. **UI** — a `WorkloadPanel` under a new `'workload'` entry in the board's existing `Tab` union, plus a `PersonWorkloadCard` reused on the team board for a person's own numbers.

The load-bearing design decisions are about honesty rather than mechanics: 41% of the plan's step-days have no assignee and must be shown rather than dropped, and ~18% of one person's days sit on undated steps that belong to no month. Both are folded into the module's return types so a caller cannot forget them.

## Technical Context

**Language/Version**: TypeScript 5.8 (strict), React 19

**Primary Dependencies**: Next.js 16.2.10 (App Router, server components + server actions), Prisma 5.22 — pinned; Prisma 7 will not load this schema's `datasource db { url = env(...) }`

**Storage**: PostgreSQL via Prisma. Two new nullable-with-default columns on `workspace_settings`; no new tables, no data migration.

**Testing**: No test runner is configured in this repository. Verification is by typecheck, production build, and Playwright driving a local PostgreSQL — the method used for the last three features. See [quickstart.md](./quickstart.md).

**Target Platform**: Web, deployed on Cranl. Container start runs `scripts/migrate.sh`, which does `prisma db push`, so the two new columns are created on deploy with no separate step.

**Project Type**: Single Next.js application; no separate frontend/backend.

**Performance Goals**: The whole plan is ~330 steps. Every rollup is O(steps) over data the page already fetches. No new database round-trip; the panel must add no perceptible time to `/projects`.

**Constraints**:
- **No RLS.** The Supabase→Prisma migration removed row-level security, so every server action is its own and only permission gate. The one new action here (`updateWorkloadAssumptions`) must call `requireAdmin()` before it touches anything.
- **Admin-only surface.** `FR-021` makes the panel admin-only, but hiding a tab is presentation. The page already resolves `isAdmin`; the action enforces it independently.
- **Two decimal traps.** `duration_days` is `Decimal(5,1)` and arrives as a Prisma `Decimal`, not a number — the existing page already calls `Number(...)` on it, and any new read must do the same. Summing halves (`0.5` durations exist) means totals must be rounded for display but never for arithmetic.

**Scale/Scope**: 40 projects, 327 steps, 16 members, 4 brands + an unbranded group. One new tab, two new components, one new lib module, one new server action, two new columns.

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1.*

The constitution is at version 2.0.0, ratified 2026-07-15. **It predates the Supabase→Prisma migration and describes a stack this repository no longer has.** That drift is pre-existing and is not caused by this feature; it is recorded below and in [research.md](./research.md) R5 so it can be amended deliberately.

| Principle | Verdict | Notes |
|---|---|---|
| **I. Design System Fidelity** | ⚠️ Deviation, pre-existing | The constitution's canonical token map is `src/lib/tokens.ts`. Both planning boards were rebuilt in spec 003 against `src/lib/board-ui.ts`, a separate palette from the handoff design specs. The Workload tab lives on the Projects board, so it MUST use `board-ui.ts` — using the constitutional tokens here would make the new tab clash with the four tabs beside it. No new colour literals: everything comes from `UI`, `TILE`, `font`, `card`, `control`, `input`. |
| **II. Workflow Pipeline Integrity** | ✅ Pass | The 9-stage pipeline is untouched. This feature reads `ProjectStep`, which is deliberately separate from `Task`. No SLA logic is read or changed. |
| **III. Role-Based Feature Access** | ✅ Pass in substance, ⚠️ mechanism differs | The rule "Capacity and Settings hidden from non-admins" is honoured and extended: the Workload tab is admin-only. The constitution requires DB-level enforcement via Postgres RLS; **RLS no longer exists**, so enforcement is `requireAdmin()` inside the server action. This is the same mechanism every other action in the codebase now uses. |
| **IV. Design-Driven Development** | ⚠️ Deviation, justified | Requires a standalone HTML design file as the source of truth. The handoff here is two screenshots. Mitigated by transcribing every observed element into the spec, and by verifying the mock's numbers against live data — which found the mock is a stale snapshot, so pixel-matching its figures would be actively wrong. Layout and structure follow the screenshots; figures follow the data. |
| **V. Cultural UX & Celebration System** | ✅ Not applicable | Read-only view; no stage advances, so no celebration path is touched. |
| **VI. State Architecture & Persistence** | ⚠️ Deviation, pre-existing | The constitution mandates Zustand + Supabase. The repository uses server components with Prisma and a custom HMAC session. This feature follows the code: server-fetched data, `useState` for tab and person selection, no new global state. The two persisted assumptions go to Postgres, satisfying the principle's actual intent — nothing durable in local storage. |

**Gate result: PASS.** Three deviations, all pre-existing and all documented. None is introduced by this feature, and none is a licence to write ad-hoc colours or skip a permission check.

### Post-design re-check (after Phase 1)

Re-evaluated against the artifacts now that the design exists. Nothing moved, and two things got firmer:

- **§I** — [contracts/workload.md](./contracts/workload.md) §4 pins every visual element to a named `board-ui.ts` export. There is no route to an ad-hoc colour that would not show up in review as a raw hex.
- **§III** — the `requireAdmin()` call is written into the action contract as clause 1, with the reason stated: with RLS gone it is the entire gate. It is a distinct task in Phase 2, not a line inside a larger one.
- **§IV** — the deviation stands and is now better justified: Phase 0 proved the reference screenshots are a stale snapshot (mock Forefront 444h ⇒ 74 step-days vs. 94 live), so pixel-matching their figures would ship wrong numbers. Structure follows the screenshots; figures follow the data.

No new violations. No entry added to Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/004-projects-workload/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── workload.md      # Phase 1 output — module + action contracts
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Phase 2 — created by /speckit-tasks, not here
```

### Source Code (repository root)

```text
prisma/
└── schema.prisma                         # + hours_per_step_day, capacity_period_end on WorkspaceSettings

src/
├── app/(app)/projects/page.tsx           # widen the member select; load workspace settings
├── actions/
│   └── settings.ts                       # + updateWorkloadAssumptions (requireAdmin)
├── lib/
│   ├── projects.ts                       # unchanged — reused for ProjectView/StepView and isLate
│   ├── workload.ts                       # NEW — every calculation in this feature
│   └── board-ui.ts                       # unchanged — the panel's only source of colour
└── components/projects/
    ├── ProjectsView.tsx                  # + 'workload' in the Tab union, admin-gated
    ├── WorkloadPanel.tsx                 # NEW — totals, brand rollup, capacity rollup
    ├── PersonWorkloadCard.tsx            # NEW — one person, month by month
    └── TeamBoard.tsx                     # + a person's own card (FR-021 second half)
```

**Structure Decision**: The existing single-app layout is kept. The one structural choice worth naming is putting all arithmetic in `src/lib/workload.ts` with no React and no Prisma imports — the same shape as `src/lib/projects.ts`, whose docstring already explains why: *"any number that means 'late' or 'this week' has to agree across both. Deriving them twice is how two screens start telling the same person different things."* This feature adds a third and fourth surface reading the same steps, which makes that rule more important, not less. It is also what makes the maths testable without a browser.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Second palette (`board-ui.ts`) alongside the constitutional `tokens.ts` | The Workload tab sits beside four tabs already built on `board-ui.ts`; matching them is the only visually coherent option | Using `tokens.ts` would make one tab in five look foreign. The real fix is a constitution amendment reconciling the two palettes — out of scope here, raised in research R5. |
| Permission enforced in the action rather than by RLS | RLS was removed with Supabase and does not exist to be used | There is no database-level gate available. The action check is the whole defence, which is why it is a task in its own right rather than a line in a bigger one. |
