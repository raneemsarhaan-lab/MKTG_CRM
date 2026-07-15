# Implementation Plan: Personal Board — GenZ Redesign

**Branch**: `001-personal-board-genz` | **Date**: 2026-07-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-personal-board-genz/spec.md`

## Summary

Replace the current `src/components/PersonalBoard.tsx` with a GenZ-styled
personal command centre that uses the canonical Fluxo design-token system
(lime `#C8F24E`, violet `#B79CF5`, ink `#1B1A13`, rail `#17181A`). The
redesign introduces four themed BigStat cards, a dark capacity bar, real-time
alert-status badges, "My Day" / "Up Next" task panels, a profile strip, and a
team-digest section — all driven by existing Zustand store state with no new
data sources.

## Technical Context

**Language/Version**: TypeScript 5.8 + React 19

**Primary Dependencies**: Zustand v5 (state), Lucide React v0.546 (icons),
date-fns (date arithmetic), Tailwind CSS v4 (utility classes + `@theme`),
Montserrat + Inter + Caveat via Google Fonts

**Storage**: Existing Zustand `fluxo-storage` (localStorage) — tasks,
members, slaConfig. No new storage keys introduced.

**Testing**: None mandated (per Constitution — testing regime TBD in a future
amendment)

**Target Platform**: Web SPA — Vite 6 build, served via GitHub Pages

**Project Type**: Single React component (`src/components/PersonalBoard.tsx`)
within an existing Vite + React + TypeScript monolith

**Performance Goals**: Component renders synchronously with the rest of the
page; no additional spinner or loading state needed. AlertStatus calculation
MUST complete in < 1ms per task (pure date arithmetic, no I/O).

**Constraints**:
- Single file replacement; `App.tsx` routing and sidebar unchanged
- No new npm dependencies; use existing `date-fns` for all date logic
- All colours via design tokens (no ad-hoc hex literals outside the token map)
- Must not break existing `TaskModal` or `TaskForm` integration

**Scale/Scope**: ~600–750 LOC; one component file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Check | Status |
|---------|-------|--------|
| I — Design System Fidelity | Use token map (`ink`, `rail`, `lime`, `coral`, `violet`, `cyan`, `mint`, `muted`, `soft`, `panel`, `line`). Montserrat 700–900 for headings, Inter for body. No ad-hoc hex. | ✅ PASS |
| II — Workflow Pipeline Integrity | Reads `STAGE_MAP` from `src/data/stages.ts`; no stage additions or reorders. SLA read from `slaConfig` store key; no stored breach flag. | ✅ PASS |
| III — Role-Based Feature Access | Admin gate enforced: capacity edit controls hidden for non-admin users. Uses `currentUser.access === 'admin'` from store. | ✅ PASS |
| IV — Design-Driven Development | Implementing from design file `6c0ca5ca-Fluxo_Personal_Board_GenZ.html`. Pixel-level fidelity required. | ✅ PASS |
| V — Cultural UX | `CelebrationOverlay` already wired in `App.tsx`; this component does not manage celebrations directly. No changes to celebration system. | ✅ PASS |
| VI — State Architecture | Uses existing `useStore` hook; `selectTask` for modal; `members`, `tasks`, `slaConfig`, `currentUser` from store. No new persisted keys. | ✅ PASS |

**Post-design re-check**: Re-validate after Phase 1 confirms no new colours or
store keys were introduced.

## Project Structure

### Documentation (this feature)

```text
specs/001-personal-board-genz/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/           ← Phase 1 output
│   └── component-api.md
└── tasks.md             ← Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── components/
│   └── PersonalBoard.tsx   ← REPLACE (single file change)
├── data/
│   └── stages.ts           ← read-only (STAGE_MAP, SLA_DEFAULTS)
├── store/
│   └── useStore.ts         ← read-only (tasks, members, slaConfig, currentUser)
├── types.ts                ← read-only (Task, Member, StageId, AccessLevel)
└── index.css               ← read-only (fonts already imported)
```

**Structure Decision**: Single-project, single-file replacement. The entire
feature is `src/components/PersonalBoard.tsx`. No new files in `src/` are
needed; all helpers stay co-located in that file.

## Complexity Tracking

> No constitution violations — complexity tracking not required.
