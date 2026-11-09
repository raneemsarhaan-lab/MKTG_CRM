# Implementation Plan: Spreadsheet Editing and Sheet Tabs

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `013-spreadsheet-editing`) | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/013-spreadsheet-editing/spec.md`, clarified on 2026-11-09:
- **Option C:** a Sheets section in the sidebar. Its home page shows folder cards, and pinned folders (Content and Video by default) sit under it.
- **Folders open as workbooks**, with Excel's sheet-tab menu along the bottom.
- **Team-wide folders.** Team columns are open to everyone; pipeline fields keep today's edit rule.
- **The Board's Content tab and Sheet view stay** as shortcuts to the same sheets.

Planning note from the user: "the sheet with C option and their recommendations".

## Summary

Every sheet in Momentum gets Google Sheets–style editing:
- click and type, double-click to edit inside the text;
- range selection by drag, Shift and the headers;
- copy, cut and paste that round-trips with Excel and Google Sheets;
- Delete clears a range;
- undo and redo;
- rows and columns inserted, deleted and resized.

A new **Sheets** section holds folders. Each folder opens as a workbook with tabs at the bottom and Excel's tab menu: Insert, Delete, Rename, Move or Copy, Protect, Tab Color, Hide, Unhide and Select All Sheets. Content and Video are linked folders whose first tab is today's sheet; every other sheet is a blank grid. Everything saves on its own and comes back after a reload.

The approach (details in [research.md](./research.md)):

- **One grid engine (R1).** `GridCore`, already shared by the two linked sheets, grows range selection, clipboard, undo, row heights, row and column menus, and windowing. A new blank-sheet model plugs into it, so linked and blank sheets edit exactly alike.
- **The board's sheet host is reused (R2).** `/sheets/[folder]` draws the linked tab with `KanbanBoard` in a `surface="sheets"` mode, fed by a loader shared with `/board`. Moves, drops, uploads, the task panel and celebrations stay one code path.
- **Blank sheets keep stable row and column ids (R3).** Only filled cells are stored. Inserts never shift other people's edits.
- **Clipboard (R4):** HTML tables and Excel-quoted TSV in both directions, grown from today's paste parsers.
- **Undo (R5):** a per-sheet stack of inverse change sets, saved like any edit.
- **Saving (R6):** an outbox that batches, retries and shows "Saving… / Saved / Not saved, retrying".
- **Linked cells (R6):** `writeTaskCells` writes them with today's rules (stage moves through `setTaskStage`), in batches.
- **Speed (R7):** windowed rows (and columns above 40) keep 5,000-row sheets responsive.
- **Who may edit (R8):**
  - blank sheets: everyone, unless protected;
  - team columns: everyone;
  - task fields: owner, assignee, admins, superusers.
- **Tabs (R9):** Excel's menu, one server action per verb.
- **Pins and the last tab (R10):** pins per member on the server; the last open tab per device in `localStorage`.
- **Linked folders (R11):** created once by an idempotent backfill.
- **Deleting a folder (R12):** a 10-second Undo, reusing spec 007's pending deletes.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router, on Node 22.

**Primary Dependencies**: Existing only:
- next-intl and Prisma v5;
- the sheets' `GridCore`, `SheetGrid`, `VideoSheet`, `ContentSheet` and `useSheetColumns`;
- `KanbanBoard`;
- spec 007's pending deletes.

No new dependency (R1, R7).

**Storage**: PostgreSQL via `db push`. Six new tables (`sheet_folders`, `sheets`, `sheet_rows`, `sheet_cols`, `sheet_cells`, `linked_row_heights`) and `members.sheet_pins`. Everything is additive ([data-model.md](./data-model.md)).

**Testing**:
- **A new `npm run lab:spreadsheet`:**
  - Node checks of clipboard, selection, undo, positions and tab rules;
  - Playwright scenarios with a stub server for the blank sheet, workbook, tab bar and home page.
- **`lab:sheet`** gains range, paste-into-cells and undo scenarios on the linked sheets.
- **Regressions:** `lab:header`, `lab:inbox`, `lab:notify`, `lab:brief`, `lab:attachments`.
- **Then:** typecheck, preflight, `next build`, and running-app checks with two members ([quickstart.md](./quickstart.md) §3).

**Target Platform**: The Momentum web app on Cranl (one `next start`), on current Chrome, Safari, Edge and Firefox, desktop and phone.

**Project Type**: Web application (Next.js App Router, server actions, Prisma).

**Performance Goals**:
- moving the selection or switching tabs takes under 100 ms on a sheet with 5,000 filled cells (SC-005);
- a 1,000 × 20 paste takes under 3 s (SC-001).

**Constraints**:
- **No formulas.**
- **Limits:** 5,000 rows, 200 columns and 50,000 characters per cell.
- **Batching:** 2,000 cells per save call, 500 task cells per call.
- **The linked sheets** must keep every behaviour from specs 008–010 and pass their existing lab.
- **Server enforcement:** every rule is enforced on the server (constitution §III).

**Scale/Scope**:
- about 15 members;
- tens of folders, each with up to a few dozen sheets;
- blank sheets mostly under 2,000 rows.

## Constitution Check

*GATE: checked before Phase 0, and again after Phase 1 below.*

| Principle | Status | How |
|---|---|---|
| **§I Design System Fidelity** | Pass | Existing `--sheet-*` tokens, plus new `--sh-*` variables mirrored in `src/lib/tokens.ts` (`SHEETS_UI`) for the tab bar, selection and tab palette. Montserrat for headings, Inter for the rest. |
| **§II Workflow Pipeline Integrity** | Pass | Stage changes from typing, pasting or undo go through `setTaskStage`'s rule and celebration (FR-061). Deleting linked rows uses today's drop and archive. No stage, SLA or pipeline change. |
| **§III Role-Based Feature Access** | **Pass, with one widening recorded** | Task fields keep the owner, assignee, admin and superuser rule. **Team columns become editable by every member (FR-060, R8).** That is the user's choice in the clarifications. It's recorded in Complexity Tracking because §III's table says a `user` edits "own tasks only". Protection (FR-059b) is enforced on the server for the protector and admins. |
| **§IV Design-Driven Development** | Gate | `design/sheets.html` (the full design: home, workbook, grid selection, menus, dialogs, phone, Arabic) is made first, building on `design/sheets-options.html` option C. No UI task starts before the user approves it. |
| **§V Cultural UX** | Pass | A `sheets` namespace in English and Arabic with parity checked in the lab. Everything mirrors. Letter headings stay A, B, C as in Excel. Celebrations are unchanged and still fire from stage pastes where due. |
| **§VI State Architecture** | Pass | Types first in `src/types/index.ts` (`SheetFolderKind`, `SheetKind`, `TabColor`). Application data lives in Postgres. Undo history and the outbox are in-memory workbook state. Only the last open tab per folder uses `localStorage` (`momentum.sheets.last.*`), as the 2.1.0 per-device allowance permits. The Zustand store is unchanged. |
| **Tech Stack** | Pass | No new dependency. The constitution's stack table still lists Supabase and Vercel; that drift is noted, not changed here, as in specs 010–012. |

## Project Structure

### Documentation (this feature)

```text
specs/013-spreadsheet-editing/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R13
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── server.md        # actions, routes, changed actions
│   └── ui.md            # navigation, home, workbook, grid, tab bar, states
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
design/
└── sheets.html                          # the full design (§IV), before any UI

prisma/schema.prisma                     # SheetFolder, Sheet, SheetRow, SheetCol, SheetCell, LinkedRowHeight; Member.sheet_pins
scripts/
├── sheets-backfill.ts                   # the two linked folders and sheets (R11)
├── backfill.sh                          # + a step for it
└── spreadsheet-lab/                     # build.sh, entry.tsx, fixtures, pure.mjs, scenarios/, stubs

src/
├── types/index.ts                       # SheetFolderKind, SheetKind, TabColor, SheetDoc, CellChange
├── lib/
│   ├── sheet-clipboard.ts               # R4: parse and serialise HTML and TSV (pure)
│   ├── sheet-selection.ts               # ranges, extend, edges (pure)
│   ├── sheet-undo.ts                    # change sets and inverses (pure)
│   ├── sheet-positions.ts               # midpoints, renumbering (pure)
│   ├── sheet-names.ts                   # "Sheet N", "(2)", validation (pure)
│   ├── board-data.ts                    # loadBoardData(member), moved from board/page.tsx (R2)
│   └── tokens.ts                        # SHEETS_UI
├── actions/
│   ├── sheets.ts                        # folders, tabs, applySheetChanges, writeTaskCells, row heights
│   └── sheet-columns.ts                 # setValues: any member on a live task (R8)
├── app/
│   ├── globals.css                      # --sh-* and the grid's selection, row resize, tab bar
│   └── (app)/
│       ├── board/page.tsx               # uses loadBoardData
│       └── sheets/
│           ├── page.tsx                 # the home page
│           └── [folderId]/page.tsx      # an open folder
├── components/
│   ├── sheet/
│   │   ├── GridCore.tsx                 # + selection, clipboard, undo, row heights, menus, windowing (R1, R7)
│   │   ├── SheetGrid.tsx                # writeCells / canWrite for the Video sheet
│   │   ├── VideoSheet.tsx               # writeCells via writeTaskCells
│   │   └── parse-clips.ts               # re-exports sheet-clipboard
│   ├── content/ContentSheet.tsx         # writeCells via writeTaskCells
│   ├── kanban/KanbanBoard.tsx           # surface="sheets"
│   ├── shared/{Sidebar,NavRail,TabBar}.tsx  # Sheets, pinned folders, phone bar
│   └── sheets/
│       ├── SheetsHome.tsx               # folder cards, New folder, pins, delete with Undo
│       ├── Workbook.tsx                 # breadcrumb, toolbar, save status, open sheet, tab bar
│       ├── TabBar.tsx                   # tabs, Excel's menu, drag and Ctrl+drag, overflow
│       ├── MoveCopyDialog.tsx · UnhideDialog.tsx
│       ├── BlankSheet.tsx + blank/model.ts   # the blank grid on GridCore
│       ├── useOutbox.ts                 # R6
│       └── useUndo.ts                   # R5
├── lib/nav.tsx                          # Sheets after Board
└── messages/{en,ar}.json                # sheets.*
```

**Structure Decision**: The single Next.js app, as in specs 005–012. Pure logic lives in `src/lib/sheet-*.ts` so the lab checks it in Node. Screens are under `src/components/sheets/`, and the shared grid stays in `src/components/sheet/`.

## Phase 0 → Phase 1

- **Phase 0:** [research.md](./research.md) R1–R13. No open questions are left.
- **Phase 1:**
  - [data-model.md](./data-model.md);
  - [contracts/server.md](./contracts/server.md) and [contracts/ui.md](./contracts/ui.md);
  - [quickstart.md](./quickstart.md).
- **Phase 2:** tasks come from `/speckit-tasks`. They start with the design file (§IV) and the pure modules and lab, then the schema, actions and backfill. The UI follows only after the design is approved: the grid engine, then blank sheets, then the workbook and tabs, then the home page and navigation, and last the linked sheets' new editing.

## Constitution Check (post-design)

Rechecked against the Phase 1 design:
- **§I, §II, §V, §VI and Tech Stack:** still pass.
- **§III:** still passes with the one recorded widening. Every action in contracts/server.md checks the session member, and protection, linked-sheet guards and task rules are enforced on the server.
- **§IV:** the design file is task 1 and gates the UI.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Team columns editable by every member** (FR-060), wider than §III's "user: own tasks only" | The user asked to remove read-only limits. Team columns are the team's shared notes about a piece (Hook, Reviewer notes), not pipeline fields. Keeping them owner-only blocks the shared editing the request is about. Task fields keep the §III rule. | Keeping today's rule everywhere contradicts the user's decision. Opening every task field to everyone would let a `user` rename, reassign or move anyone's task, which §II and §III protect. **Needs sign-off** in the PR; a constitution note may follow. |
| **Growing `GridCore`** rather than adding a spreadsheet library | Linked cells (stage pills, people, files, links) must keep rendering as today, with one keyboard model for every sheet. | Handsontable, AG Grid and similar are major new dependencies (a Tech Stack amendment), often commercially licensed, and replace our cell rendering. |
