# Implementation Plan: Sheet view rebuild

**Branch**: `claude/wonderful-dirac-k1wflu` (the work stays on it) | **Date**: 2026-11-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-sheet-view-rebuild/spec.md`

## Summary

Make a Space's views reliable tabs (Board · Sheet · Calendar · List · + View) and turn the Sheet view into a workbook whose first tab, **Board**, mirrors the board (same tasks, same filter, grouped Theme › Pillar), plus added tabs that are **unlinked** (plain sheet; one row at a time can become a task) or **linked** (every titled row is a task). Linking and relinking never duplicate a task: a row remembers its task. Inside a tab, rows sit under theme and pillar groups with one level of child rows. Columns follow the unified field system per tab and per person. A one-time, dry-run-first conversion maps today's Content and Video sheets onto the Board tabs and old Sheets-section tabs onto the matching Spaces, with nothing deleted.

The approach extends what exists rather than replacing it: the Space's rows sheet (`content_rows`, themes, pillars, "Make task") becomes the Board tab; added tabs reuse the same row model with a `sheet_id`; old spreadsheet tabs (`kind 'blank'`) stay spreadsheets and are the "unlinked" tabs of type spreadsheet, so their formatting, formulas and comments carry over untouched. See [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.8, Node 22

**Primary Dependencies**: Next.js 16.4 (App Router, server actions), React 19, Prisma 5, next-intl 4, Zustand

**Storage**: PostgreSQL 16 via Prisma `db push`; schema changes additive only (scripts/schema-guard.sh: no drop/rename/type change/SET NOT NULL)

**Testing**: Playwright real-app suite (`scripts/spaces-lab/realapp/run.cjs`, ~130 scenarios) + `tsc --noEmit`; new scenarios per user story

**Target Platform**: Web (desktop and phone), deployed on Cranl (staging from this branch)

**Project Type**: Web application (single Next.js app: `src/app`, `src/components`, `src/actions`, `src/lib`, `prisma`)

**Performance Goals**: Sheet opens < 2 s; Board tab stays responsive with 2,000+ tasks (windowed grid, already in GridCore); cross-view updates visible < 5 s

**Constraints**: No data loss; additive schema; English + Arabic (RTL); every permission enforced in server actions; the conversion dry-runs on a copy of a fresh live backup and applies only after approval

**Scale/Scope**: ~450 tasks, 5 Spaces, ~10 members today; 6 user stories, 47 FRs, 4 stages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Design System Fidelity | New UI uses the token map and the sheet look shipped on 25 Nov (globals.css sheet tokens); no new palette | Pass |
| II. Workflow Integrity | Tasks created from rows start in the board's first stage; stage moves keep `allowedStages` gates (linked rows' Status edits go through the same move action) | Pass |
| III. Role-Based Feature Access | Tab link/unlink/delete: creator, admins, superusers; themes: admins, superusers; pillars: + theme owner; all checked in server actions (FR-025, FR-047) | Pass |
| IV. Design-Driven Development | The owner's prototype ("Space views") is the design reference; screenshots per stage are compared with it | Pass (prototype exists) |
| V. Cultural UX | No change to celebrations; Arabic for all new strings | Pass |
| VI. State Architecture & Persistence | Per-person layouts and the shared Mine/Everyone choice persist server-side (member prefs), not only in local storage | Pass |

Post-design re-check: Pass (no new violations; one schema relaxation, `content_rows.project_id` DROP NOT NULL, is additive under the guard and justified in Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/027-sheet-view-rebuild/
├── plan.md              # This file
├── research.md          # Phase 0: decisions
├── data-model.md        # Phase 1: entities and schema changes
├── quickstart.md        # Phase 1: how to validate each stage
├── contracts/
│   └── server-actions.md  # Phase 1: the server actions the UI calls
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
prisma/schema.prisma                 # Sheet.linked, Sheet.space_id, ContentRow.sheet_id/group_id/last_task_id, SheetGroup
src/actions/
├── views.ts                         # rename / duplicate saved views (A)
├── sheet-tabs.ts                    # NEW: add, rename, duplicate, delete, link, unlink, link preview (B)
├── content-rows.ts                  # rows in any tab: add, make task, unlink row, add existing, remove (B, C)
└── content-themes.ts / pillars      # themes/pillars per tab; groups in unlinked tabs (C)
src/lib/
├── tab-link.ts                      # NEW: pure column matching and link preview (create N / reconnect N)
└── sheet-convert.ts                 # conversion + dry-run report (D)
src/components/
├── views/ViewHost.tsx               # tab menu: Rename, Duplicate, Set as default, Delete, Pin, Hide (A)
├── views/SpacePage.tsx, BrandPage.tsx, NodeWorkbook.tsx
├── kanban/KanbanBoard.tsx           # Cards / List toggle never opens the sheet (A)
├── sheets/Workbook.tsx, TabBar.tsx  # Board tab first and fixed; tab menu link/unlink; link icon (B)
├── sheets/LinkTabDialog.tsx         # NEW: column matching + counts (B)
└── content/ContentSheet.tsx, ContentGrid.tsx  # any tab's rows: groups, + Row, child rows, drag (B, C)
scripts/spaces-lab/realapp/scenarios-027-*.cjs  # tests per stage
scripts/release/sheet-convert-report.sh         # read-only dry-run report (D)
```

**Structure Decision**: Single Next.js app as today. New code goes beside the modules it extends; one new actions file (`sheet-tabs.ts`) and one pure helper (`tab-link.ts`) keep the linking rules testable.

## Stages

- **A. Views and tabs (US1)**: view tab menu (Rename, Duplicate, Set as default, Delete, Pin, Hide; built-ins not deletable), List views everywhere, Cards/List toggle on the Board (compact list of the same board; never the sheet), last view per person per Space and folder (exists; verify), loading fix (done).
- **B. Board tab and linked/unlinked tabs (US2, US3)**: Board tab = the Space's rows sheet, first and fixed, showing every board task (No theme last) with the Board's shared filter; tab menu; "+" adds an unlinked rows tab; link wizard (match, counts, untitled listed); unlink keeps rows and remembers tasks; relink reconnects; Make task / Unlink row / Add existing task; remove from tab vs archive; permissions.
- **C. Structure (US4)**: theme/pillar groups per tab (projects in linked tabs, labels in unlinked); + Row lines, insert above/below, paste plan on a group; child rows (Tab / Shift+Tab, subtasks when linked); drag to move or nest; delete asks where rows go.
- **D. Columns and conversion (US5, US6)**: per-tab, per-person columns (exists for the rows sheet; extend to tabs); conversion of Content/Video sheets to Board tabs (a mapping) and old Sheets-section tabs to Spaces, with a read-only report on a copy of a fresh backup, applied after approval.

Each stage ends with its scenarios, the full suite, a commit and a push to the branch.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `content_rows.project_id` becomes nullable (DROP NOT NULL) | Rows in an unlinked tab sit under label groups, not projects | A separate row table for tabs would duplicate the whole rows feature (Make task, child rows, paste, values) and its tests |
| Unique `(space_id, task_id)` on rows kept, rows in added tabs carry `space_id = NULL` and a new unique `(sheet_id, task_id)` | A task can be in several linked tabs (FR-015) but once per tab | Dropping the existing unique would need a destructive index change and lose the Board tab's one-row-per-task rule |
