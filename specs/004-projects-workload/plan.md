# Implementation Plan: Projects Workload — per team member and per brand

**Branch**: `004-projects-workload` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-projects-workload/spec.md` (54 functional requirements, post-clarification)

> **This plan was rewritten on 2026-08-12** after the clarification session. The first version assumed the panel was pure arithmetic over existing data. Four of the five deferred metrics came back in, and one of them — the seniority/supervision rule — changed the feature's centre of gravity. Nothing below is carried over unexamined.

## Summary

Add an admin-only **Workload** tab to the Projects board that rolls the plan up by brand and by person, plus a per-person card showing month-by-month load.

The first plan described this as "mostly arithmetic over data already loaded". That is no longer true. The clarification session added:

- **Milestones** — a flag on a step, seeded by the importer from the plan's existing marker names.
- **Consumed hours** — done step-days valued in hours. Free, and proven exact against live data.
- **Seniority** — a level on a member, with a configurable effort factor that applies **only to complex steps**.
- **Supervision** — computed per step off the *adjusted* days, accruing to a configurable supervising role.
- **Step complexity** — a threshold with per-step overrides, because the rule needs a simple/complex distinction the data does not have.

The load-bearing consequence is not any single one of those. It is that **plan days and effort days are now different quantities**. Before, every figure summed to the plan, and that property was the panel's whole defence against being quietly wrong. A multiplier and a phantom overhead break it. So the module carries both: plan days always reconcile, effort days deliberately do not, utilisation is measured on effort, and reconciliation is checked on plan (FR-043, FR-044).

Everything still funnels through one pure module, `src/lib/workload.ts`, which imports neither React nor Prisma. That mattered before; with a five-input calculation it matters more, because it is the only way the arithmetic can be checked without a browser.

## Technical Context

**Language/Version**: TypeScript 5.8 (strict), React 19

**Primary Dependencies**: Next.js 16.2.10 (App Router, server components + server actions), Prisma 5.22 — pinned; Prisma 7 will not load this schema's `datasource db { url = env(...) }`

**Storage**: PostgreSQL via Prisma. Four columns added to `workspace_settings`, two to `project_steps`, one to `members`, and **one new table** for the per-level rates (research R1). Every addition carries a default, so `prisma db push` needs no backfill.

**Testing**: No test runner is configured. Verification is typecheck, production build, a `tsx` reconciliation harness against the pure module, and Playwright driving a local PostgreSQL. See [quickstart.md](./quickstart.md).

**Target Platform**: Web, deployed on Cranl. `scripts/migrate.sh` runs `prisma db push` at container start, so schema changes land on deploy. The seed must create the three seniority rows; the plan importer must seed milestone flags.

**Project Type**: Single Next.js application.

**Performance Goals**: ~330 steps, 16 members, 4 brands. Every rollup is O(steps) over data the page already fetches. No new database round-trip on the projects page beyond widening two existing selects.

**Constraints**:
- **No RLS.** Every server action is its own and only permission gate. This feature adds three (`updateWorkloadAssumptions`, `updateSeniorityLevel`, and step-flag edits), and each needs `requireAdmin()` before it touches anything.
- **Two decimal traps.** `duration_days` is `Decimal(5,1)` and arrives as a Prisma `Decimal`. The new rate columns are decimals too. Convert once at the boundary; round for display, never for arithmetic. A factor of 1.8 applied to halves produces values like 3.6 — display rounding must not be allowed to break reconciliation.
- **Order of operations is fixed by the rule.** `adjusted = days × factor`, then `supervision = adjusted × rate`. Supervision compounds off the adjusted figure, not the planned one. Reversing these gives plausible, wrong numbers.
- **Self-supervision must be excluded** (FR-051), or a marketing manager holding complex steps feeds their own overhead.

**Scale/Scope**: One new tab, three new components, one new lib module, three new/extended server actions, one new table, seven new columns, two importer changes.

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1.*

Constitution 2.0.0 (ratified 2026-07-15) predates the Supabase→Prisma migration and describes a stack this repository no longer has. That drift is pre-existing; it is recorded here and in [research.md](./research.md) R6 rather than planned around.

| Principle | Verdict | Notes |
|---|---|---|
| **I. Design System Fidelity** | ⚠️ Deviation, pre-existing | The constitutional token map is `src/lib/tokens.ts`; both planning boards were rebuilt in spec 003 on `src/lib/board-ui.ts`. The Workload tab sits beside four tabs built on the latter and must match them. No new colour literals — see [contracts/workload.md](./contracts/workload.md) §5. |
| **II. Workflow Pipeline Integrity** | ✅ Pass | The 9-stage pipeline is untouched. This feature reads `ProjectStep`, deliberately separate from `Task`. The dropped deliverables tile was the only thing that would have crossed into pipeline data. |
| **III. Role-Based Feature Access** | ✅ Pass in substance, ⚠️ mechanism differs | Workload tab is admin-only, extending "Capacity and Settings hidden from non-admins". The constitution requires DB-level enforcement via RLS; RLS no longer exists, so `requireAdmin()` in each action is the whole gate. |
| **IV. Design-Driven Development** | ⚠️ Deviation, justified | Requires a standalone HTML design file; the handoff is screenshots. Phase 0 proved the mock is a stale snapshot, so matching its figures would ship wrong numbers. Structure follows the screenshots; figures follow the data. |
| **V. Cultural UX & Celebration System** | ✅ Not applicable | Read-only view. No stage advances. |
| **VI. State Architecture & Persistence** | ⚠️ Deviation, pre-existing | Constitution mandates Zustand + Supabase; the repo uses server components with Prisma and a custom HMAC session. The principle's actual intent — nothing durable outside Postgres — is honoured: all seven new settings persist to the database. |

**New consideration raised by the clarification.** §III fixes review-stage ownership by role (`c-final` and `final-check` → Marketing Manager). FR-048 makes supervision accrue to a configurable role **defaulting to Marketing Manager**, which is consistent with that table rather than a coincidence — it is the same person the constitution already puts on review duty. Making the role configurable rather than hardcoded keeps this a setting, not a second, competing ownership table. That is a deliberate choice to avoid a §II conflict.

**Gate result: PASS.** Three deviations, all pre-existing, none introduced here.

### Post-design re-check (after Phase 1)

- **§I** — [contracts/workload.md](./contracts/workload.md) §5 pins every visual element to a named `board-ui.ts` export, including the new "shows its workings" affordance for adjusted figures.
- **§III** — three actions now need gating, not one. Each is a separate task, and the contract states `requireAdmin()` as clause 1 of every one.
- **§II** — re-examined after adding the supervising role. Supervision reads `Member.role` only; it does not read, write or depend on stage ownership, SLA or any pipeline table. No coupling introduced.

No new violations. Complexity Tracking gains one entry for the new table.

## Project Structure

### Documentation (this feature)

```text
specs/004-projects-workload/
├── plan.md              # This file (rewritten 2026-08-12)
├── research.md          # Phase 0 (rewritten)
├── data-model.md        # Phase 1 (rewritten)
├── quickstart.md        # Phase 1 (rewritten)
├── contracts/
│   └── workload.md      # Phase 1 (rewritten)
├── checklists/
│   └── requirements.md  # From /speckit-specify + /speckit-clarify
└── tasks.md             # Phase 2 — /speckit-tasks, not created here
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                      # + SeniorityLevel model; + 7 columns (see data-model.md)
└── seed.ts                            # + the three seniority rows, upsert-style

scripts/
└── import-plan.ts                     # + seed step.milestone from marker names, never overwriting

src/
├── app/(app)/projects/page.tsx        # widen member select (role, seniority, capacity);
│                                      #   load workspace settings + seniority levels
├── actions/
│   ├── settings.ts                    # + updateWorkloadAssumptions, updateSeniorityLevel
│   ├── projects.ts                    # updateStep gains milestone + complexity override
│   └── members.ts                     # updateMember gains seniority
├── lib/
│   ├── projects.ts                    # unchanged — ProjectView/StepView, isLate, byBrand
│   ├── workload.ts                    # NEW — every calculation in this feature
│   └── board-ui.ts                    # unchanged — the panel's only source of colour
└── components/
    ├── projects/
    │   ├── ProjectsView.tsx           # + 'workload' in the Tab union, admin-gated
    │   ├── WorkloadPanel.tsx          # NEW — totals, brand rollup, capacity rollup
    │   ├── PersonWorkloadCard.tsx     # NEW — one person, month by month
    │   └── TeamBoard.tsx              # + a person's own card (FR-021)
    └── settings/
        ├── TeamSettings.tsx           # + seniority on the member row (its Save button already exists)
        └── WorkloadSettings.tsx       # NEW — rates, threshold, supervising role
```

**Structure Decision**: The single-app layout is kept. The choice worth naming is still that all arithmetic lives in `src/lib/workload.ts` with no React and no Prisma import — and it is now doing more work than it was. Five configurable inputs (hours per step-day, per-level factor, per-level rate, complexity threshold, supervising role) feed one calculation consumed by three surfaces. Deriving any of it twice would produce two answers to "is Yosra overloaded", which is precisely the failure `src/lib/projects.ts` was factored out to prevent. It is also the only way to check the reconciliation properties without a browser.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A new `SeniorityLevel` table | Each level carries two configurable rates, and the set of levels is a list the settings UI must render and edit | Six more columns on the `WorkspaceSettings` singleton (`junior_factor`, `junior_rate`, `mid_factor`, …) encodes a list as columns, cannot gain a level without a migration, and gives the UI nothing to iterate. See research R1. |
| Second palette (`board-ui.ts`) alongside constitutional `tokens.ts` | The tab sits beside four built on `board-ui.ts` | Using `tokens.ts` makes one tab in five look foreign. Real fix is a constitution amendment — research R6. |
| Permission enforced in actions rather than by RLS | RLS was removed with Supabase and does not exist | No database-level gate is available. Each of the three actions gets its own task rather than a line inside a bigger one. |
| Plan days and effort days both carried | Seniority and supervision make effort ≠ plan, but reconciliation must still be checkable | Carrying only effort loses the ability to prove no step-day was lost. Carrying only plan makes utilisation a lie. Both, with the difference inspectable, is the honest option — FR-043. |
