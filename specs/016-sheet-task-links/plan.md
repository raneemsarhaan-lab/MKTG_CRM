# Implementation Plan: Link a Blank Sheet's Columns to Board Tasks

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `016-sheet-task-links`) | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/016-sheet-task-links/spec.md`, clarified on 2026-11-11:
- **Any pipeline task** can be linked: Content pieces, Video tasks and clips, project tasks.
- **New tasks** from unlinked rows are plain board tasks in the first stage, with no theme or pillar.
- **No automatic rows.** People add rows.

## Summary

A blank sheet keeps its own layout. One column names each row's task, and other columns can stand for task fields. The approach (details in [research.md](./research.md)):

- **A row knows its task (R1).** A nullable `sheet_rows.task_id` holds the resolved task. The Task cell keeps what was typed. Formats, comments and merges keep keying on the row id, so every stage 1–3 tool keeps working.
- **One mapping per sheet (R2).** `sheets.task_map` lists the Task column and which columns stand for which fields, by column id. So moving or hiding a column keeps its mapping.
- **Matching (R3).** A link or a uuid matches its task. Otherwise an exact title matches, ignoring case. Several matches make a choice; none leaves the row "Not linked". A whole column resolves in two queries.
- **Writes go through the board's own rules (R5).** One batch action, `writeTaskFields`, checks and saves each mapped cell:
  - `canAct` for task fields;
  - the move rules for stage, with the celebration;
  - the link and member checks;
  - the team columns' types.

  Refusals are counted, never silent. Undo replays earlier values through the same action.
- **The board shows up in the sheet (R6, R7).**
  - Values load with the sheet, and refresh when the tab is focused and every 60 seconds while it's visible.
  - The cell under a mapped field keeps a snapshot, so unmapping, unlinking or a deleted task leaves plain text.
- **Creating and adding tasks (R8, R9).**
  - Create tasks for rows… makes plain board tasks in To do, with a Paste plan–style preview.
  - Add tasks… picks existing tasks into new linked rows.
- **Content and Video sheets are unchanged.** Linking is for blank sheets only.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router.

**Primary Dependencies**: next-intl and Prisma v5. **No new dependency.**

**Storage**: PostgreSQL via Prisma, applied with `db push`. Two additive columns:
- `sheet_rows.task_id`, a nullable foreign key that becomes null when the task is deleted;
- `sheets.task_map`, nullable jsonb.

**Testing**:
- the existing spreadsheet lab: `pure.mjs`, the smoke test on PostgreSQL, and Playwright running-app scripts;
- a new `realapp/links.cjs`.

**Target Platform**: the Momentum web app (desktop and phone), English and Arabic.

**Project Type**: web application (Next.js server actions + React client).

**Performance Goals**:
- linking 2,000 rows reports in under 5 s;
- a mapped edit shows on the board within 2 s;
- arrow keys stay under 100 ms on a linked sheet (SC-002, SC-004).

**Constraints**:
- **One rule set:** every task change goes through the board's checks (constitution §II, §III).
- **No live push:** a 60-second refresh while visible (R6).
- **Never destructive:** deleting rows, columns or sheets never touches a task.

**Scale/Scope**: sheets of up to 5,000 rows (the spec 013 limit). Up to 20 mapped fields, and 2,000 writes per call.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| **§I Design System Fidelity** | Badges, markers, the linked tint and the dialogs use `--sh-*` / `--fx-*` tokens. A new `--sh-linked` tint is made from existing colours. | Pass (planned) |
| **§II Workflow Pipeline Integrity** | Stage changes go through `setTaskStage` and its move rules, with the same celebration. Every other field goes through the board's validation. New tasks start in the first stage of the workspace's pipeline. Deleting sheet rows never deletes tasks. | Pass |
| **§III Role-Based Feature Access** | Task edits need `canAct` (owner, assignee, admin, superuser). Creating tasks needs `requireTaskCreator`. Protected sheets add the sheet's rule on top. All of it is checked in the actions, and the UI shows reasons. | Pass |
| **§IV Design-Driven Development** | `design/sheet-task-links.html` (link dialog, badges and markers, Choose a task, Add tasks, Create tasks preview, phone, Arabic) is approved **before** any UI. | Gate: design first |
| **§V Cultural UX** | All strings in English and Arabic, with Arabic plurals. Stage names and dates follow the member's language. Owned-stage moves celebrate as on the board. | Pass (planned) |
| **§VI State Architecture** | Types first. The mapping, row links and snapshots are server state. Open dialogs are UI-only. | Pass |
| **Tech Stack** | No new dependency. | Pass |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/016-sheet-task-links/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/server.md · contracts/ui.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
prisma/schema.prisma                         # SheetRow.task_id, Sheet.task_map
src/types/index.ts                           # TaskField, SheetTaskMap, LinkedTask, TaskFieldWrite/Result
src/lib/sheet-links.ts                       # pure: parse links, match titles, validate a mapping, shown text per field
src/lib/sheet-undo.ts / sheet-doc.ts         # + 'taskMap', 'rowTasks', 'taskFields' changes
src/actions/sheets.ts                        # loadSheet returns taskMap, rowTasks, tasks; applySheetChanges takes taskMap, rowTasks
src/actions/sheet-links.ts                   # linkColumn, resolveTaskCells, writeTaskFields, refreshTaskFields, searchTasks, createTasksForRows
src/components/sheets/BlankSheet.tsx         # mapped cells: show task values, route edits, markers, badges, notes
src/components/sheets/links/                 # LinkDialog, ChooseTask, AddTasks, CreateTasksPreview, useTaskLinks
src/components/sheets/Workbook.tsx           # Board ▾ menu, refresh on focus and every 60 s, celebration overlay
messages/en.json, messages/ar.json           # sheets.links.*
design/sheet-task-links.html                 # §IV
scripts/spreadsheet-lab/                     # pure checks, smoke checks, realapp/links.cjs
```

**Structure Decision**: this extends spec 013's blank sheet and spec 015's sheet tools rather than adding a new kind of sheet. A linked blank sheet is still a blank sheet (FR-040).

## Phase 0 → Phase 1

- **Phase 0** ([research.md](./research.md)): R1–R12. Nothing is left as NEEDS CLARIFICATION.
- **Phase 1:**
  - [data-model.md](./data-model.md);
  - [contracts/server.md](./contracts/server.md);
  - [contracts/ui.md](./contracts/ui.md);
  - [quickstart.md](./quickstart.md).

## Constitution Check (post-design)

Rechecked after Phase 1:
- every task change reuses the board's checks;
- every permission is in the actions;
- the state is on the server;
- there's no new dependency.

The design gate (§IV) still applies before UI tasks. **Pass.**

## Complexity Tracking

None.
