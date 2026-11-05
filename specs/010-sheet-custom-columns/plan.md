# Implementation Plan: Sheet Columns You Can Shape

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `010-sheet-custom-columns`) | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/010-sheet-custom-columns/spec.md`, clarified: everyone who can open a sheet may change its columns. Planning note from the user: "the updates of the sheets", meaning both the Content sheet and the Video sheet.

## Summary

Both sheets get a spreadsheet-like column layout that the team shapes itself:
- rename any column;
- add custom columns (Text, Number, Date, Link, Person, Choice, Checkbox);
- reorder by dragging or with keyboard moves;
- hide and show (per column set on the Video sheet);
- resize;
- delete custom columns with a 10-second Undo;
- paste into custom columns from a Google Sheet.

Technical approach (details in [research.md](./research.md)):
- **Layout records (R1, R2):** one table, `sheet_columns`, holds every column the team has touched, built-in or custom: sheet, key, name, position, width, the sets it is shown in, and for custom columns the kind and choice options. It also records who changed it last and when (FR-004).
- **Values (R3):** custom values go in `sheet_values`, one row per column and task, stored as normalised text.
- **One pure layout function (R4):** `applyLayout(builtIns, records, set)` in `src/lib/sheet-columns.ts` turns the code's built-in columns and the stored records into the grid's column list (order, names, widths). Both sheets and the lab use it.
- **Shared grid, extended (R5):** `GridCore` gains a header menu button, drag-to-reorder, edge resizing and double-click fit. Each sheet's model renders custom cells through one shared module, `src/components/sheet/CustomCell.tsx`.
- **Keyboard path (R6):** a **Columns** panel in each toolbar lists every column with every action. The header menu offers the same actions by pointer.
- **Paste (R9):** Paste plan and Paste clips match pasted headings to current column names. Custom values are checked by the same pure parser on client and server.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router.

**Primary Dependencies**: Existing only: next-intl, Prisma v5, `GridCore`, `SheetMenu` / `SheetPopover`, `LinkPrompt`, `PersonChip`. No new dependency (drag and resize use native pointer and drag events).

**Storage**: PostgreSQL via `db push`. Two new tables, `sheet_columns` and `sheet_values`. Nothing else changes.

**Testing**:
- `npm run lab:sheet`, extended with Node checks on `src/lib/sheet-columns.ts` and Playwright scenarios for both sheets (`col-*` and `vcol-*`);
- `lab:inbox`, `lab:attachments` and `lab:brief` as regressions;
- `typecheck`, `preflight` and `next build`;
- running-app checks with two members on local PostgreSQL.

**Target Platform**: Desktop browsers first; phones use the header menu and the Columns panel (no drag). Deployed on Cranl.

**Project Type**: Web application (single Next.js project).

**Performance Goals**:
- Adding a column and filling its first value takes under 30 s (SC-001).
- A column change shows instantly (optimistic) and is saved within 1 s.
- Loading the board adds one query of at most a few thousand short value rows.

**Constraints**:
- Built-in behaviour unchanged in any position and under any name (SC-004, SC-005, §II).
- A value is stored only if its kind's parser accepts it, checked on the server (FR-023).
- Token colours only (§I). Strings in English and Arabic (FR-060).

**Scale/Scope**:
- Two sheets; up to 30 custom columns each; hundreds of rows.
- 2 tables, 1 pure module, about 11 server actions, 4 new components; changes to `GridCore`, both sheet models and both paste flows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Gate | Status |
|---|---|---|
| **I. Design System Fidelity** | Token colours only. | **Pass.** Choice colours come from a new `CHOICE_COLORS` token list (AA with white text). CSS uses `--sheet-*`. The lab's tokens-only check covers the new files. |
| **II. Workflow Pipeline Integrity** | No stage or SLA change. | **Pass.** Built-in columns keep their cells and behaviour. Layout records only change name, position, width and visibility. Custom values never touch stages. |
| **III. Role-Based Feature Access** | Gates in UI and server; `user` = own tasks. | **Pass, with a recorded decision.** Changing a sheet's columns is open to every member (the user's clarification), because the layout is shared furniture, not task data. Editing a row's custom value follows the existing row rule (owner, assignee, admin, superuser) in the UI and on the server. Every change records who made it (FR-004). Recorded for PR sign-off. |
| **IV. Design-Driven Development** | Design file before UI. | **Pass, with a task.** `design/sheet-columns.html` (header menu, Columns panel, add-column dialog, custom cells, drag and resize) is committed and published before UI work. It is plain HTML, the same sign-off as specs 005–009. |
| **V. Cultural UX** | Arabic strings; celebrations unchanged. | **Pass.** New strings are in both `sheet` and `content` namespaces. Custom names show as typed. Moves and celebrations are untouched. |
| **VI. State Architecture** | No persisted store state; unions in types first. | **Pass.** The shared layout lives in the database, because every member sees it. The Video sheet's chosen set stays a per-device preference, as today. `ColumnKind` and `SheetId` go in `src/types/index.ts` first. |
| **Tech Stack** | No new dependency. | **Pass.** |

No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/010-sheet-custom-columns/
├── spec.md · plan.md · research.md (R1–R12) · data-model.md · quickstart.md
├── contracts/server.md · contracts/columns-ui.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
prisma/schema.prisma                      SheetColumn, SheetValue
src/types/index.ts                        SheetId, ColumnKind, ChoiceOption, SheetColumnRecord, ColumnLayout
src/lib/sheet-columns.ts                  pure: applyLayout, parseValue, formatValue, checkName, fitWidth, merge helpers
src/lib/tokens.ts                         CHOICE_COLORS
src/actions/sheet-columns.ts              addColumn, renameColumn, moveColumn, setColumnShown, resizeColumn,
                                          updateColumn, deleteColumn, restoreColumn, setValue, setValues
src/components/sheet/GridCore.tsx         header menu button, drag reorder, edge resize, fit on double-click
src/components/sheet/ColumnMenu.tsx       header menu items (Rename, Insert, Move, Hide, Edit, Delete, Reset)
src/components/sheet/ColumnsPanel.tsx     the toolbar Columns panel (keyboard path, who-changed tooltips)
src/components/sheet/ColumnEditor.tsx     add / edit a column: name, kind, choice options, kind-change review
src/components/sheet/CustomCell.tsx       render and edit custom values for both sheets
src/components/sheet/VideoSheet.tsx, SheetGrid.tsx            layout applied; custom cells; Columns button
src/components/content/ContentSheet.tsx, ContentGrid.tsx      the same
src/components/sheet/parse-clips.ts, PastePreview.tsx         custom headings and values (Video)
src/components/content/parse-plan.ts, PlanPreview.tsx         custom headings and values (Content); addPlan values
src/components/kanban/KanbanBoard.tsx     loads and passes columns and values; host calls
src/app/(app)/board/page.tsx              loads sheet_columns and sheet_values
messages/en.json, messages/ar.json        `sheet.columns.*` (shared by both sheets)
design/sheet-columns.html                 the design file
scripts/sheet-lab/                        column fixtures, stub actions, Node checks, scenarios col-* and vcol-*
```

**Structure Decision**: The layout logic is pure and shared; the grid core gains the generic header interactions; each sheet's model adds custom cells through one shared component. This is the same split specs 008 and 009 used.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Built-in and custom columns in one `sheet_columns` table | Order, names, widths and visibility mix both kinds in one list, and FR-004 wants "who changed it" on each | A JSON layout blob per sheet would make two people's changes to different columns overwrite each other |
| Soft delete for custom columns | The 10-second Undo restores the column and its values (SC-007) | A hard delete would need its values copied somewhere for Undo |

## Post-design Constitution Check

Re-checked after research, data model and contracts:
- **§III:** layout actions require a session; value actions apply the row rule on the server.
- **§VI:** nothing new in browser storage.
- **§II:** `applyLayout` never drops a built-in column from the data, only from view.

All gates still pass.
