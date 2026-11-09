---
description: "Task list for Spreadsheet Editing and Sheet Tabs"
---

# Tasks: Spreadsheet Editing and Sheet Tabs

**Input**: Design documents from `specs/013-spreadsheet-editing/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: As in specs 006–012, each story ends with lab checks:
- the new `npm run lab:spreadsheet` holds Node checks of the pure modules and Playwright scenarios with a stub server;
- `lab:sheet` gains scenarios for the linked sheets;
- server behaviour is checked against a production build on local PostgreSQL, with two members (quickstart §3).

**Conventions**

| Term | Meaning |
|---|---|
| Grid | `src/components/sheet/GridCore.tsx` (shared engine, R1) |
| Pure | `src/lib/sheet-clipboard.ts`, `sheet-selection.ts`, `sheet-undo.ts`, `sheet-positions.ts`, `sheet-names.ts` |
| Actions | `src/actions/sheets.ts` (contracts/server.md) |
| UI | `src/components/sheets/` (`SheetsHome`, `Workbook`, `TabBar`, `BlankSheet`, dialogs, `useOutbox`, `useUndo`) |
| Board | `src/components/kanban/KanbanBoard.tsx` |
| Lab | `scripts/spreadsheet-lab/`, `npm run lab:spreadsheet` |
| Strings | `useTranslations('sheets')`, English and Arabic in the same task |
| Colours | `SHEETS_UI` in `src/lib/tokens.ts` and `--sh-*` in `globals.css` only |

## Format: `[ID] [P?] [Story] Description`

**Phase order.** The five P1 stories come first, ordered so each builds on the last:
1. US3 (the way in);
2. US1 (editing);
3. US5 (saving);
4. US2 (selection and clipboard);
5. US4 (tabs).

Then the P2 stories: US6, US7 and US8.

---

## Phase 1: Setup

- [X] T001 The design file `design/sheets.html`, built on the approved `design/sheets-options.html` (option C) and following contracts/ui.md §1–§7. It shows:
  - the sidebar with Sheets and pinned folders;
  - the Sheets home: linked and team cards, New folder, a card's menu, delete with Undo;
  - a workbook: breadcrumb, toolbar with undo and redo and the save status, a blank sheet with a range selected, row and column menus, a resized row with wrapped text, the skip note;
  - the Content folder's linked tab;
  - the tab bar: colours, lock, 🔗, grouped tabs, overflow arrows, the ≡ list;
  - Excel's tab menu, the Move or Copy, Unhide, Delete and Protect dialogs;
  - the offline status;
  - the 390 px layout and Arabic.

  Publish it as an artifact and commit it. **UI tasks (Phase 3 on) start only after the user approves it (§IV).**
- [ ] T002 [P] Lab skeleton in `scripts/spreadsheet-lab/`, following `scripts/notify-lab/`:
  - `build.sh`: esbuild bundles for `entry.tsx` (UI) and `pure-entry.ts` (Node), with aliases to `scripts/notify-lab/stubs/` for `next/navigation` and `next/link`;
  - `gen.mjs`: CSS from `globals.css`, the sheet block plus the new sheets block;
  - `fixtures.ts`: folders (linked and team), sheets with colours, hidden and protected ones, a 5,000 × 26 sheet, members (an admin and a `user`);
  - `pure.mjs`, `ui-runner.mjs` and `scenarios/index.mjs` (with a `MISSING_MESSAGE` trap);
  - `index.html`.

  Add `"lab:spreadsheet"` to `package.json` and `scripts/spreadsheet-lab/out/` to `.gitignore`.

---

## Phase 2: Foundational (blocks every story)

- [ ] T003 Schema in `prisma/schema.prisma` (data-model §1–§2):
  - **New models:** `SheetFolder`, `Sheet`, `SheetRow`, `SheetCol`, `SheetCell`, `LinkedRowHeight`, with their indexes;
  - **New column:** `Member.sheet_pins String[]? @db.Uuid`;
  - **Partial unique indexes** for one `content` folder, one `video` folder and one sheet of each linked kind, added through a raw SQL step in `scripts/migrate.sh` after `db push`.

  Run `npx prisma generate` and `bash scripts/migrate.sh` locally.
- [ ] T004 [P] Types in `src/types/index.ts`: `SheetFolderKind`, `SheetKind`, `TabColor`, `SheetSummary`, `FolderSummary`, `SheetDoc`, `CellChange`, `SheetChanges`, `TaskCellEntry`.
- [ ] T005 [P] Tokens: `SHEETS_UI` in `src/lib/tokens.ts` (tab palette, selection fill and edge, tab highlight, row-resize handle) and the matching `--sh-*` variables in `src/app/globals.css`.
- [ ] T006 [P] The `sheets.*` strings in `messages/en.json` and `messages/ar.json`. They cover:
  - navigation;
  - the home page;
  - the breadcrumb;
  - the toolbar and save status;
  - cell, row and column menus;
  - Excel's tab menu and its disabled reasons;
  - the Move or Copy, Unhide, Delete and Protect dialogs;
  - skip notes;
  - the folder Undo;
  - "Sheet {n}", "{name} ({n})";
  - errors (data-model §3 codes);
  - the deleted-sheet message.

  The Arabic names stay as written for Excel ("ورقة {n}").
- [ ] T007 [P] Pure modules in `src/lib/`:
  - `sheet-clipboard.ts` (R4): `parseClipboard({ html, text })` → `string[][]`, Excel and Google Sheets HTML, TSV with Excel quoting; `serialise(cells)` → `{ html, text }`;
  - `sheet-selection.ts`: `Range`, `extend`, `edge(direction)` for Ctrl+arrow, `rowRange`, `colRange`, `size`, `fillTargets`;
  - `sheet-undo.ts` (R5): `ChangeSet`, `invert`, a 100-step `Stack`, `push`, `undo`, `redo`;
  - `sheet-positions.ts` (R3): `between(a, b)`, `needsRenumber`, `renumber`;
  - `sheet-names.ts`: `nextSheetName`, `uniqueName`, `validateName` (forbidden characters, 1–50 characters, case-blind uniqueness).

  Then make `src/components/sheet/parse-clips.ts` re-export `cellsFromHtml` and `cellsFromText` from `sheet-clipboard.ts`.
- [ ] T008 Node checks in `scripts/spreadsheet-lab/pure.mjs` for every module in T007 (quickstart §1):
  - clipboard round trips: Excel HTML, Google Sheets HTML, TSV with quoted line breaks and tabs;
  - fill;
  - selection maths and edges;
  - undo inverses for every change kind;
  - positions and renumbering;
  - names;
  - EN/AR parity of `sheets.*`.

  Run `node scripts/sheet-lab/scenarios.mjs pure` afterwards to confirm Paste clips still parses.
- [ ] T009 Server actions in `src/actions/sheets.ts` (contracts/server.md):
  - `listFolders`, `createFolder`, `renameFolder`, `deleteFolder`, `setPins`;
  - `listSheets`, `createSheet`, `loadSheet`;
  - `applySheetChanges`, with limits, protection, `gone` skips, renumbering, and bumping `updated_at` and `updated_by`.

  Each checks the session member and the linked guards (data-model §3).
- [ ] T010 [P] Backfill: `scripts/sheets-backfill.ts`, safe to run twice, creates the Content and Video folders with their linked sheets (data-model §5). Add a step for it to `scripts/backfill.sh`.
- [ ] T011 [P] Move the board's data loading from `src/app/(app)/board/page.tsx` into `loadBoardData(member)` in `src/lib/board-data.ts`, and call it from the board page with no change in behaviour (R2). Confirm with `lab:header` and a `/board` load.

**Checkpoint**: the schema is applied, the pure modules are green in the lab, the actions answer, and the existing labs still pass.

---

## Phase 3: User Story 3: the Sheets section and its folders (Priority: P1) 🎯 the way in

**Goal**: Sheets in the sidebar opens a home page of folder cards. Pinned folders sit under it. A folder opens as a workbook (breadcrumb, toolbar, the open sheet, and a minimal tab bar for now). The Board's Content tab and Sheet view are unchanged.

**Independent Test**: Open Sheets: Content and Video are there and pinned. Create "Campaign planning": it opens with "Sheet 1". Pin it, then reload: all as left.

- [ ] T012 [US3] Navigation:
  - **`src/lib/nav.tsx`:** add `{ href: '/sheets', key: 'sheets' }` after Board, with a `sheets` icon.
  - **`src/components/shared/Sidebar.tsx` and `NavRail.tsx`:** the item, with the member's pinned folders under it (`data-pinned-folder`), each with a ⋯ menu (Unpin; Rename and Delete for team folders).
  - **`src/components/shared/TabBar.tsx`:** Sheets third, and Team into More (R13).

  Pins come from a small server read in `src/app/(app)/layout.tsx`, passed into `AppShell`.
- [ ] T013 [US3] The home page: `src/app/(app)/sheets/page.tsx` (`listFolders`) and `src/components/sheets/SheetsHome.tsx` (contracts/ui.md §2):
  - linked cards first;
  - team cards by name;
  - New folder inline, then opening the folder;
  - each card's menu: Pin / Unpin, Rename, Delete;
  - Delete with a 10-second Undo through `src/lib/pending-deletes.ts` (R12).
- [ ] T014 [US3] The workbook route: `src/app/(app)/sheets/[folderId]/page.tsx` loads the folder, `listSheets` and, for a linked folder, `loadBoardData`. `src/components/sheets/Workbook.tsx` draws:
  - the breadcrumb (`data-crumb`) and 🔗 Linked;
  - the toolbar shell (undo, redo, save status);
  - the open sheet: `?sheet=`, else `localStorage` `momentum.sheets.last.<folderId>` (R10), else the first visible sheet;
  - a basic tab bar (click to switch, "+");
  - and remembers the last tab.
- [ ] T015 [US3] The linked tab: a `surface="sheets"` prop on `src/components/kanban/KanbanBoard.tsx` draws only the Content sheet or the Video sheet, with no board header, toolbar or board, and keeps every API, the task panel, uploads and celebrations (R2). Use it from `Workbook` for the linked tab.
- [ ] T016 [US3] A first `BlankSheet` (`src/components/sheets/BlankSheet.tsx` and `blank/model.ts`) draws a `SheetDoc` on `GridCore`: letter headings, numbered rows, text cells, and single-cell edits saved through `applySheetChanges`. This is enough for the independent test; US1 and US5 complete it.
- [ ] T017 [US3] Lab scenarios `s3-*` in `scripts/spreadsheet-lab/scenarios/index.mjs`:
  - home order;
  - New folder;
  - pin and unpin;
  - delete with Undo;
  - opening the last tab;
  - the breadcrumb;
  - the phone bar order.

  Then run `lab:header` for the sidebar change.

**Checkpoint**: Sheets exists, folders open, and blank sheets take a typed value.

---

## Phase 4: User Story 1: edit cells the way I do in Google Sheets (Priority: P1)

**Goal**: Type to replace, double-click to edit inside, Enter, Tab and arrows to move, Delete to clear, on blank and linked sheets.

**Independent Test**: In a blank sheet and in the Content sheet: type, double-click-edit, move with the keys, clear. All changes show at once and survive a reload.

- [ ] T018 [US1] Grid editing changes (FR-001–FR-006):
  - a double-click edits with the caret at the click point (`caretPositionFromPoint`, with a fallback);
  - the editor becomes an auto-growing textarea, with Alt+Enter for a line break;
  - Shift+Enter and Shift+Tab move back;
  - Ctrl/Cmd+arrows jump to the data's edge through `sheet-selection.edge`;
  - Page Up and Page Down move by the visible rows;
  - arrows inside an editor move the caret.

  Existing menu, link and checkbox cells keep their behaviour.
- [ ] T019 [US1] Row windowing in the Grid (R7):
  - only visible rows, plus 10 above and below, inside a full-height spacer;
  - offsets from a prefix sum of row heights;
  - the active row always rendered;
  - `aria-rowcount` and `aria-rowindex` kept true;
  - column windowing above 40 columns.

  Confirm the linked sheets' scroll-to-row (`?row=`) still works.
- [ ] T020 [US1] Complete `BlankSheet`'s model: `isText` everywhere, `textValue` and `onCommit` through the outbox (US5's T024 replaces the direct call), the letter headings (A…Z, AA…), row numbers, and 120 px default widths.
- [ ] T021 [US1] Lab:
  - scenarios `s1-*`: type, double-click caret, Alt+Enter, every navigation key, mirrored in Arabic, Delete;
  - `lab:sheet` additions: double-click edit and Shift+Tab on the Content and Video sheets.

  Run the whole `lab:sheet` (150 scenarios) to confirm nothing regressed.

---

## Phase 5: User Story 5: everything saves itself and comes back (Priority: P1)

**Goal**: Every change saves on its own with a visible status. Reload restores folders, tabs and content. Offline work is kept and retried.

**Independent Test**: Make one change of each kind, wait for "Saved", reload: everything is as it was, on this device and another.

- [ ] T022 [US5] `src/components/sheets/useOutbox.ts` (R6):
  - a per-workbook queue of change sets, applied on screen at once;
  - flushes 400 ms after the last change, or on blur, tab switch or `pagehide`;
  - chunks of 2,000 cells;
  - retry backoff at 2, 4, 8 and 16 s, then every 30 s;
  - a `beforeunload` guard;
  - the status `saving · saved · retrying(N)`;
  - refusals roll the cell back to the server's value and set a note.
- [ ] T023 [US5] Save status in `Workbook` (`data-save-status`, read aloud politely), and the "This sheet was deleted…" state with Copy and Close when the server says `gone` for the open sheet.
- [ ] T024 [US5] Wire every blank-sheet change through the outbox: cell edits, and (after US7) inserts, deletes and sizes. Wire the sheet-level changes through the same queue in order.
- [ ] T025 [US5] Lab scenarios `s5-*`:
  - the status sequence;
  - offline, retrying, then recovering;
  - the `beforeunload` guard;
  - a refused change rolls back with a note;
  - two pages editing different cells of one sheet keep both (the stub server merges by cell).

---

## Phase 6: User Story 2: select blocks, and copy, cut and paste them (Priority: P1)

**Goal**: Range selection by drag, Shift and the headers. Copy, cut and paste that round-trip with Excel and Google Sheets, on blank and linked sheets. Delete clears a range.

**Independent Test**: Paste a 5 × 3 table from Google Sheets into a blank sheet: the 15 values land right. Copy a block out to Google Sheets: the same block arrives.

- [ ] T026 [US2] Selection in the Grid (FR-010–FR-012):
  - anchor and focus;
  - drag with pointer capture and auto-scroll at the edges;
  - Shift+click and Shift+arrows;
  - row-number and heading clicks, with Shift and Ctrl/Cmd;
  - Ctrl/Cmd+A;
  - `.is-selected` and a range frame;
  - "N cells selected" in the toolbar;
  - the announcement of the active cell and range size.
- [ ] T027 [US2] Clipboard in the Grid (FR-020–FR-026):
  - **copy:** `serialise` → `clipboardData` (`text/html`, `text/plain`);
  - **cut:** copy plus a pending clear, applied on paste, dropped on Esc or a new copy;
  - **paste:** `parseClipboard` from the active cell or the selection's top-left; fill for a single value; the pasted block becomes the selection;
  - **skips:** counted, with the reason (`data-skip-note`);
  - **menu items:** through `navigator.clipboard`, with the "use Ctrl/Cmd+V" message where reading is refused.

  The grid asks the model through new optional hooks: `readCells(range)`, `writeCells(changes)` → `{ skipped }`, `canWrite(row, col)`. Delete and Backspace over a range clear it in one change set.
- [ ] T028 [US2] Blank sheets: `readCells` and `writeCells` in `blank/model.ts`. A paste larger than the sheet adds rows and columns up to the limits.
- [ ] T029 [US2] Linked sheets:
  - `writeTaskCells` in `src/actions/sheets.ts` (contracts/server.md): grouped per task, today's paths for each field, stage moves through `setTaskStage`'s rule, people matched by name, team columns through `setValues`;
  - `setValues` in `src/actions/sheet-columns.ts` opened to any member on a live task (R8, FR-060);
  - `readCells`, `writeCells` and `canWrite` in `src/components/sheet/SheetGrid.tsx` (Video) and `src/components/content/ContentGrid.tsx` (Content), with grouping rows skipped;
  - the "looks like new rows" rule still opening Paste clips and Paste plan (FR-026);
  - celebrations from stage pastes go through the board's existing handler.
- [ ] T030 [US2] Lab:
  - scenarios `s2-*`: drag, Shift and header selection; paste Excel HTML, Google Sheets HTML and TSV with line breaks; copy out; cut and paste; fill; Delete over a range; growing a blank sheet to fit;
  - `lab:sheet` additions: paste five titles into the Content sheet, a status paste moves by the rule, a `user`'s paste over others' tasks is skipped with the count, a team column paste by a `user` saves, a paste of new rows still opens the preview.

---

## Phase 7: User Story 4: sheet tabs at the bottom, with Excel's tab options (Priority: P1)

**Goal**: The full tab bar and Excel's menu: Insert, Delete, Rename, Move or Copy, Protect, Tab Color, Hide, Unhide, Select All Sheets. Plus drag, Ctrl+drag, overflow arrows, the ≡ list and the shortcuts.

**Independent Test**: In a team folder: "+" twice, rename, colour, Move or Copy as a copy to the front, protect, hide and unhide, delete the copy, then reload: all as left. The last visible sheet can't be deleted or hidden.

- [ ] T031 [US4] The remaining tab actions in `src/actions/sheets.ts` (contracts/server.md, R9):
  - `renameSheet`;
  - `deleteSheets`;
  - `moveSheets`, with copy duplicating rows, columns and cells with new ids in one statement;
  - `colorSheets`;
  - `protectSheet`;
  - `hideSheets`.

  Each enforces the linked and last-visible guards. `applySheetChanges` refuses edits on protected sheets for anyone but the protector and admins.
- [ ] T032 [US4] `src/components/sheets/TabBar.tsx` (contracts/ui.md §5):
  - ARIA tabs with the keyboard model;
  - colour stripes, 🔒 and 🔗;
  - the open tab clearly raised;
  - inline rename on a double-click or F2;
  - drag to reorder, Ctrl/Option+drag to copy, with a drop marker;
  - overflow scroll arrows at the start, as in Excel (right-click lists the sheets);
  - the ≡ list;
  - Ctrl+Page Up/Down and Shift+F11 from anywhere in the workbook.
- [ ] T033 [US4] Excel's tab menu in `TabBar` (`data-tab-menu`), in Excel's order, with disabled reasons:
  - Insert;
  - Delete (confirm);
  - Rename;
  - Move or Copy…;
  - Protect Sheet… / Unprotect Sheet;
  - Tab Color (swatches, No Color);
  - Hide;
  - Unhide…;
  - Select All Sheets, with Ctrl/Shift+click grouping and `.is-grouped`.

  The group actions are Delete, Move or Copy, Tab Color and Hide. Ending a group: a click on a single tab.
- [ ] T034 [P] [US4] The dialogs:
  - `src/components/sheets/MoveCopyDialog.tsx`: to folder, before sheet or "(move to end)", ☐ Create a copy. A linked sheet is copy-only, and the client pastes its visible text into the new blank sheet (R11);
  - `UnhideDialog.tsx`;
  - the Delete and Protect confirmations.

  Each is a `role="dialog"` with focus trapped and Esc to close.
- [ ] T035 [US4] Grouping and protection on screen:
  - a protected sheet's cells refuse edits with the reason for everyone but the protector and admins;
  - the menu shows Unprotect only to them.
- [ ] T036 [US4] Lab scenarios `s4-*`:
  - every menu item;
  - the disabled reasons, including linked and last visible;
  - names (next free, "(2)", forbidden characters);
  - drag and Ctrl+drag;
  - a grouped colour and hide;
  - overflow arrows and the list;
  - the shortcuts;
  - tab ARIA;
  - axe on the menu and the dialogs.

---

## Phase 8: User Story 6: undo and redo (Priority: P2)

**Goal**: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y), plus toolbar buttons. Per-sheet history of at least 100 steps, with one step per paste, clear or structural change.

**Independent Test**: Paste 10 × 4, clear a column, undo twice: exactly as before. Redo twice: back again.

- [ ] T037 [US6] `src/components/sheets/useUndo.ts`: one `sheet-undo` stack per sheet id in the workbook, surviving tab switches. Every change set from the Grid, `BlankSheet` and the linked models pushes its inverse. Undo and redo send through the outbox (FR-032). Refused steps are reported and dropped.
- [ ] T038 [US6] Keys and buttons: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z or Ctrl+Y in the Grid; `data-undo` and `data-redo` in the toolbar, disabled when empty. For linked sheets, inverses go through `writeTaskCells`, and a deleted row's inverse is `restoreTask`.
- [ ] T039 [US6] Lab:
  - scenarios `s6-*`: paste, clear, cut, insert and delete undone and redone exactly; one step per action; a new edit clears redo; per-sheet history; a refused undo reported;
  - a `lab:sheet` addition for undoing a title paste on the Content sheet.

---

## Phase 9: User Story 7: add, delete and resize rows and columns (Priority: P2)

**Goal**: Row and column menus insert and delete. Rows resize by their bottom edge. Sizes are kept per sheet.

**Independent Test**: Insert two rows above row 3, delete column C, drag row 5 taller and column A wider, then reload: all as left.

- [ ] T040 [US7] The Grid's row-number and heading menus (contracts/ui.md §4), on right-click, ⋯ or Shift+F10, with disabled reasons. A row resize handle on the row number's bottom edge (`data-row-resize`) has a live drag and a double-click to reset. Taller rows wrap their text.
- [ ] T041 [US7] Blank sheets: insert and delete rows and columns with ids made on the client and positions from `between` (R3); sizes through `rowHeights` and `colWidths`; all through the outbox and undo.
- [ ] T042 [US7] Linked sheets (FR-042):
  - Insert row starts a draft clip or piece in that group, as "+ Clip" and "+ Piece" do;
  - Delete rows confirms with the count, then drops or archives through today's API;
  - Insert column opens spec 010's add-column flow;
  - Delete column only for team columns;
  - row heights through `setLinkedRowHeights` in `src/actions/sheets.ts`, kept in `linked_row_heights`.
- [ ] T043 [US7] Lab:
  - scenarios `s7-*`: insert and delete above, below, left and right; ids restored on undo; resize and reset; wrapping;
  - `lab:sheet` additions: insert a clip row, delete two rows with the confirmation, a pipeline column's Delete disabled with its reason.

---

## Phase 10: User Story 8: the linked sheets keep working as they do today (Priority: P2)

**Goal**: Everything from specs 008–010 still works, the Board's Content tab and Sheet view show the same sheets, and the new editing applies there too.

**Independent Test**: The full `lab:sheet` passes unchanged. In Sheets › Content, paste five titles over five pieces: renamed on the board.

- [ ] T044 [US8] Run the full `lab:sheet` and fix any regression in the grown Grid. Confirm in the running app that the Board's Content tab and Sheet view use the same editing as Sheets › Content and Sheets › Video (FR-078).
- [ ] T045 [US8] Running-app checks for the linked sheets (quickstart §3, rows 7–11), recorded in `specs/013-spreadsheet-editing/validation.md`.

---

## Phase 11: Polish and validation

- [ ] T046 [P] Phones and Arabic (R13, contracts/ui.md §7):
  - tap, double-tap and long-press;
  - "Select range" in the cell menu;
  - the tab bar above the bottom navigation, with 44 px targets;
  - dialogs full-screen at 390 px;
  - every surface mirrored.

  Lab scenarios `s-phone-*` and `s-ar-*`.
- [ ] T047 [P] Speed: a 5,000 × 26 sheet with 20,000 filled cells. Keyboard moves and tab switches under 100 ms (SC-005); a 1,000 × 20 paste under 3 s (SC-001). Lab scenario `s-perf`.
- [ ] T048 Run every lab: `lab:spreadsheet`, `lab:sheet`, `lab:header`, `lab:inbox`, `lab:notify`, `lab:brief` and `lab:attachments`. Then `npm run typecheck`, `bash scripts/preflight.sh` and `npx next build`.
- [ ] T049 Running-app checks: all rows of quickstart §3 with two members on a production build. Record them in `specs/013-spreadsheet-editing/validation.md`.
- [ ] T050 [P] Docs:
  - `specs/013-spreadsheet-editing/constitution-check.md`, including the team-column widening for sign-off;
  - a "Sheets" section in `HANDOVER.md`: routes, the grid engine, models, actions, outbox and undo, clipboard, the backfill, limits, and the labs;
  - notes on specs 008–010 (the editing they gained);
  - mark this file's tasks [X].
- [ ] T051 Commit and push. Open a PR titled "Sheets: folders, Excel-style tabs and spreadsheet editing (spec 013)" and ask the user before merging.

---

## Dependencies

- **Setup → Foundational → US3 → US1 → US5 → US2 → US4**, then **US6, US7, US8**.
  - US3 gives the way in and the workbook every other story uses.
  - US1 and US5 make a sheet editable and saved.
  - US2 builds selection on US1's grid.
  - US4 needs the workbook (US3) and saving (US5).
- **US6 (undo)** needs the change sets of US1, US2 and US7. Its stack can start after US5, and US7's changes plug in when they land.
- **US7** needs the Grid menus (Phase 4 onward) and the outbox (US5).
- **US8** is the regression and integration pass over US1, US2, US6 and US7 on the linked sheets.
- **Edits to `GridCore.tsx`** (T018, T019, T026, T027, T038, T040) run one after another.
- **Edits to `src/actions/sheets.ts`** (T009, T029, T031, T042) run one after another.
- **The UI** (Phase 3 on) waits for the design's approval (T001).

## Parallel examples

- **Setup:** T002 (the lab) beside T001 (the design).
- **Foundational:** T004, T005, T006 and T007 touch different files. T010 and T011 are independent of each other and of T009. T008 follows T007.
- **US4:** T034 (dialogs) beside T032 (`TabBar`).
- **Polish:** T046, T047 and T050 side by side.

## Implementation strategy

1. **MVP:** Phases 1–5 (Setup, Foundational, US3, US1, US5). Sheets exists; folders hold blank sheets; cells are edited like Google Sheets and saved. That's demo-able on its own.
2. **Then US2:** copy and paste with Excel and Google Sheets, the most-asked capability.
3. **Then US4:** the full Excel tab bar.
4. **Then US6 and US7:** undo, and the row and column tools.
5. **Last, US8:** sweep the linked sheets, then polish, validation and the PR.

At every checkpoint the existing labs must stay green before moving on.
