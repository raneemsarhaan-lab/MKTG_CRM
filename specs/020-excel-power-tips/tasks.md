# Tasks: Excel Power Tips in the Sheets

**Input**: Design documents from `specs/020-excel-power-tips/`: plan.md, spec.md, research.md (R1–R14), data-model.md, contracts/server.md, contracts/grid.md, quickstart.md.

**Tests**: the project validates every feature with real-app labs (quickstart.md), so each story ends with its lab checks. Pure helpers are checked in `scripts/spreadsheet-lab/pure.mjs` (`npm run lab:spreadsheet`).

**Format**: `[ID] [P?] [Story] Description`. [P] means it can run in parallel (different files, no unfinished dependency).

**Stages** (plan.md), each with its own design approval, PR and lab:

- **A**: US1–US3
- **B**: US4–US6
- **C**: US7–US8

---

## Phase 1: Setup

- [X] T001 Write the stage A HTML design (keyboard and view, fill handle with Auto Fill Options and right-drag menu, Flash Fill, validation chips and ▾, Alt+Down pick, zoom, Settings → Sheet lists) in design/power-tips-a.html, and get the user's approval before any stage A UI work
- [X] T002 [P] Add the `sheets.tips.*` string namespace (en and ar) with the stage A labels, notes and shortcut names in messages/en.json and messages/ar.json
- [X] T003 [P] Create the lab skeleton (seed a 200-row team sheet with gaps, login helper with the hours-reminder handler, axe helper, cleanup) in scripts/spreadsheet-lab/realapp/tips-a.cjs

---

## Phase 2: Foundational (blocks all stories)

- [X] T004 Add the optional `GridModel` hooks from contracts/grid.md (`onFill`, `fillModes`, `onMove`, `onMoveToSheet`, `onRepeat`, `onGoToSpecial`, `pickFromColumn`, `validation`, `zoom`, `onZoom`) as types only, plus a `selectAreas(areas)` prop that selects several areas through the spec 017 model, in src/components/sheet/GridCore.tsx
- [X] T005 [P] Add the shared `FillMode` and `ValidationRecord` types, and the `validations`, `outline` and `tableTotals` `BlankChange` kinds with their inverses, in src/types/index.ts and src/lib/sheet-undo.ts *(stage A adds `validations`; `outline` and `tableTotals` come with stage B, which uses them)*
- [X] T006 Apply and queue the new change kinds (`validations`, `outline` and `slicers` via `view`, `tableTotals`) in src/lib/sheet-doc.ts, with `push` to the outbox and `mergeServer` *(stage A: `validations`; the rest with stage B)*
- [X] T007 Record the last repeatable command (`FormatCmd`, row and column insert/delete, fill, cleanup) in a `lastCmd` ref in src/components/sheets/BlankSheet.tsx (research R3)

**Checkpoint**: the grid and the blank sheet accept the new hooks; nothing changes on screen yet.

---

## Phase 3: User Story 1 - Keyboard and view moves (P1) 🎯 MVP

**Goal**: Shift/Ctrl+Space, Go to special, F4 repeat, double-click an edge to jump, Ctrl+wheel zoom, Shift+wheel, Ctrl+F1, and Alt key letters on the menu bar.

**Independent Test**: F5 → Special → Blanks selects only the empty cells; "TBD" + Ctrl+Enter fills them as one undo step; F4 repeats an insert row (spec US1).

- [X] T008 [US1] Handle Shift+Space (select the row) and Ctrl+Space (select the column) in the grid's key handler in src/components/sheet/GridCore.tsx
- [X] T009 [US1] Double-click within 4 px of the active cell's edge runs `dataEdge` in that direction, in src/components/sheet/GridCore.tsx (research R14)
- [X] T010 [P] [US1] Add pure `goToSpecial(kind, cells)` (blanks, filled, visible), which folds cells into at most 100 rectangles, in src/lib/sheet-selection.ts (research R1)
- [X] T011 [US1] Wire F5 and Edit › Go to special… to a small dialog (Blanks, Filled cells, Visible cells only) that calls the host's `onGoToSpecial` and `selectAreas`, in src/components/sheets/BlankSheet.tsx and src/components/sheets/format/FormatToolbar.tsx
- [X] T012 [US1] F4 (and Ctrl+Y with an empty redo stack) calls `onRepeat`; BlankSheet re-runs `lastCmd` on the current selection, in src/components/sheet/GridCore.tsx and src/components/sheets/BlankSheet.tsx
- [X] T013 [US1] Zoom: Ctrl+wheel and Ctrl+=/−/0 scale the grid wrapper (CSS `zoom`, 50–200%), kept in `momentum.sheet.zoom.<sheetId>` (localStorage read after mount, try/catch), with the zoom shown in the status line, in src/components/sheet/GridCore.tsx and src/components/sheets/Workbook.tsx
- [X] T014 [US1] Shift+wheel scrolls sideways where the browser doesn't already, in src/components/sheet/GridCore.tsx
- [X] T015 [US1] Ctrl+F1 collapses and expands the toolbar strip (kept per member), and Alt shows a key letter on each menu bar item (Alt+letter opens it), in src/components/sheets/format/FormatToolbar.tsx and src/components/sheets/Workbook.tsx
- [X] T016 [US1] Add the new shortcuts to the Shortcuts dialog (en and ar) in src/components/sheets/format/FormatToolbar.tsx
- [X] T017 [US1] Linked sheets: Shift/Ctrl+Space, Go to special (filled and blanks over typable cells), zoom and edge jump, through the same grid hooks, in src/components/sheet/useLinkedFormats.ts
- [X] T018 [US1] Lab checks for US1 (quickstart Stage A §1, §2 and §6) in scripts/spreadsheet-lab/realapp/tips-a.cjs

**Checkpoint**: US1 works on its own.

---

## Phase 4: User Story 2 - The fill handle and quick entry (P1)

**Goal**: the fill handle with copy and series, Auto Fill Options, the right-drag menu, double-click to the end, drag back to clear, Shift to insert, custom lists, Ctrl+; and Ctrl+Shift+;, Ctrl+E Flash Fill, and leading zeros.

**Independent Test**: 5, 10 dragged gives 15–30; a date with Fill weekdays skips Friday and Saturday; Ctrl+E fills first names; each undoes in one step (spec US2).

- [X] T019 [P] [US2] Pure series engine `planSeries(source, count, mode, ctx)` in src/lib/sheet-fill.ts (research R4). It covers:
  - number step;
  - text with a trailing number;
  - date (day, month or year step);
  - weekdays (workspace weekend, Friday–Saturday by default);
  - English and Arabic month and day names (long and short);
  - custom lists;
  - the Ctrl swap.
- [X] T020 [P] [US2] Pure Flash Fill learner `learnFlash(examples, sources)` in src/lib/sheet-fill.ts (research R5), returning the outputs or `null` when the examples aren't consistent
- [X] T021 [P] [US2] Pure checks for the series and Flash Fill cases in quickstart Stage A §3–§4 in scripts/spreadsheet-lab/pure.mjs
- [X] T022 [US2] Draw the fill handle on the newest single area. The grid handles:
  - drag with a dashed target and a preview tooltip;
  - drag back to clear;
  - Shift to insert;
  - right-drag menu;
  - double-click to the end of the neighbouring data;

  and calls `onFill`, in src/components/sheet/GridCore.tsx (RTL directions mirrored)
- [X] T023 [US2] The Auto Fill Options button stays by the last fill's target until the next action, and offers the modes from `fillModes`. A pick re-runs the fill as undo + apply in one step. In src/components/sheet/GridCore.tsx
- [X] T024 [US2] BlankSheet `onFill`: build one `BlankChange` step (cells, formats per mode, insertRows/insertCols for Shift, clears for drag-back) with the row and column limits, in src/components/sheets/BlankSheet.tsx
- [X] T025 [US2] Linked sheets `onFill`: copy and series into typable cells through `writeCells(writes, 'fill')`, with refusals counted (spec FR-013), in src/components/sheet/useLinkedEditing.ts and src/components/sheet/useLinkedFormats.ts
- [X] T026 [US2] Ctrl+; and Ctrl+Shift+; start editing with today's date or the current time; Ctrl+E runs Flash Fill on the active column (note when inconsistent), in src/components/sheet/GridCore.tsx and src/components/sheets/BlankSheet.tsx
- [X] T027 [US2] Leading apostrophe: a typed value starting with ' is stored without it and shown as text (the Text format keeps zeros), in src/components/sheets/BlankSheet.tsx and src/lib/sheet-format.ts
- [X] T028 [P] [US2] Server: `workspace_settings.fill_lists` column (prisma/schema.prisma) and `loadFillLists` / `saveFillLists` (admins only, cleaned to the limits) in src/actions/settings.ts
- [X] T029 [US2] Settings → Sheet lists editor for admins (hidden for others) in src/components/settings/FillLists.tsx, linked from the Settings page
- [X] T030 [US2] Lab checks for US2 (quickstart Stage A §3, §4 and §7) in scripts/spreadsheet-lab/realapp/tips-a.cjs

**Checkpoint**: US1 and US2 both work.

---

## Phase 5: User Story 3 - Drop-down lists and picking from the column (P1)

**Goal**: list validation on team sheets (chips, ▾, reject or warn), and Alt+Down to pick from the column on every sheet.

**Independent Test**: C2:C50 as To do/Doing/Done shows chips; typing "Maybe" is refused; Alt+Down lists the column's values (spec US3).

- [X] T031 [P] [US3] `sheet_validations` table (data-model.md) in prisma/schema.prisma, then `bash scripts/migrate.sh`
- [X] T032 [US3] Server: load validations in `loadExtras`, and accept the `validations` change (ids checked, values cleaned, at most 200 per sheet, no overlaps) in `applySheetChanges`, in src/actions/sheets.ts (contracts/server.md)
- [X] T033 [US3] Data › Data validation… dialog (values with optional colors, reject or warn; replaces an overlapping rule after a confirm) in src/components/sheets/format/ValidationDialog.tsx, wired from the Data menu in src/components/sheets/format/FormatToolbar.tsx
- [X] T034 [US3] BlankSheet:
  - validated cells render a chip and ▾, and Enter or a click opens the value menu;
  - typed, pasted, filled and moved values are checked (`invalid` counted, warn shows a note);
  - row and column inserts and deletes grow or shrink the ranges, like `tablesAfter`;

  in src/components/sheets/BlankSheet.tsx
- [X] T035 [US3] Alt+Down on a text cell opens `SheetCombo` with the column's distinct values (`pickFromColumn`) on team, Content and Video sheets, in src/components/sheet/GridCore.tsx, src/components/sheets/BlankSheet.tsx and src/components/sheet/useLinkedFormats.ts
- [X] T036 [US3] Lab checks for US3 (quickstart Stage A §5), then the stage A regressions, docs (validation.md, HANDOVER) and the stage A PR, in scripts/spreadsheet-lab/realapp/tips-a.cjs and specs/020-excel-power-tips/validation.md

**Checkpoint**: stage A is done (MVP), with its PR open and waiting for the user's merge.

---

## Phase 6: User Story 4 - Formatting gaps (P2)

**Goal**: Ctrl+Shift+1, custom K/M and `;;;` formats, Center across selection, whole-row rules, icon sets, and a menu Autofit.

**Independent Test**: 1,250,000 shows 1.3M with the value unchanged; a title is centered across A1:F1 with no merge; rows where D > 1000 are highlighted (spec US4).

- [X] T037 Write the stage B HTML design (custom format field, Center across, whole-row rule and icon sets in the rule editor, Data › Clean up tools with previews, Total row, slicers, advanced filter, outline bar, status-bar math) in design/power-tips-b.html, and get approval
- [X] T038 [P] [US4] Pure custom number-format engine (research R7: sections, 0/#, separators, `,` and `,,` scaling, decimals, literals, %, `;;;`; refuses unsupported tokens) in src/lib/sheet-numfmt.ts, with pure checks in scripts/spreadsheet-lab/pure.mjs
- [X] T039 [US4] `NumberFormat.kind = 'custom'` with `pattern` in src/types/index.ts; `display()` uses sheet-numfmt in src/lib/sheet-format.ts; a Custom field in Format Cells → Number in the existing Format Cells dialog
- [X] T040 [US4] Ctrl+Shift+1 sets Number (2 decimal places, separator) in src/components/sheets/format/FormatToolbar.tsx
- [X] T041 [US4] `ha: 'across'`: rendering lays the text over the following empty cells that also carry `across` (no merge), in src/lib/sheet-format.ts and src/components/sheets/BlankSheet.tsx; offered in Format Cells → Alignment
- [X] T042 [US4] Rule kind `icons` (arrows3, flags3, lights3, with cuts by percent or number) and `args.row` (whole-row look) in src/lib/sheet-rules.ts and src/types/index.ts; the rule editor in src/components/sheets/format/StyleTools.tsx
- [X] T043 [US4] Format › Autofit column width (the selected columns) in src/components/sheets/format/FormatToolbar.tsx and src/components/sheets/BlankSheet.tsx
- [X] T044 [US4] Lab checks for US4 (quickstart Stage B §1) in scripts/spreadsheet-lab/realapp/tips-b.cjs

---

## Phase 7: User Story 5 - Data cleanup tools (P2)

**Goal**: Remove duplicates, Split to columns, Trim/Clean, Change case, Text→Number, Fill blanks from above, Find wildcards, and Paste Special maths.

**Independent Test**: on 300 pasted rows, each tool says how many cells changed and undoes in one step (spec US5, SC-002).

- [X] T045 [P] [US5] Pure cleanup planners in src/lib/sheet-clean.ts (research R10): `dedupePlan`, `splitPlan` (delimiter or fixed width, preview), `trimClean`, `changeCase`, `toNumber` and `blanksFromAbove`, with pure checks in scripts/spreadsheet-lab/pure.mjs
- [X] T046 [P] [US5] Wildcards `*`, `?`, `~*` and `~?` in `matches` and `replaceIn` in src/lib/sheet-tools.ts
- [X] T047 [US5] Data › Clean up submenu and dialogs (Remove duplicates with column picks and a count first; Split with a preview and an insert-columns confirm) in src/components/sheets/format/CleanupDialogs.tsx, wired in src/components/sheets/format/FormatToolbar.tsx
- [X] T048 [US5] BlankSheet commands turn each plan into one `BlankChange` step, with a "N cells changed" notice and one-area guards, in src/components/sheets/BlankSheet.tsx
- [X] T049 [US5] Paste Special Add, Subtract, Multiply and Divide (the clipboard's single number, applied to numeric cells, non-numbers skipped and counted) in src/components/sheets/BlankSheet.tsx and the Paste Special dialog
- [X] T050 [US5] Lab checks for US5 (quickstart Stage B §2) in scripts/spreadsheet-lab/realapp/tips-b.cjs

---

## Phase 8: User Story 6 - Tables, totals, filters and outlines (P2)

**Goal**: Ctrl+T, a Total row, slicers, the advanced filter, outline groups, and status-bar math.

**Independent Test**: a 50-row table with a Total row follows a slicer filter; grouped rows collapse and are kept after a reload; the status bar shows Sum, Average and Count (spec US6).

- [X] T051 [P] [US6] `sheet_tables.totals` column (prisma/schema.prisma), then load it and accept the `tableTotals` change in src/actions/sheets.ts
- [X] T052 [US6] Ctrl+T runs Format as table with the default style, in src/components/sheet/GridCore.tsx and src/components/sheets/BlankSheet.tsx
- [X] T053 [US6] Total row: a sticky footer under the table's last row, with a per-column aggregate menu, computed over visible rows only, in src/components/sheets/BlankSheet.tsx
- [X] T054 [US6] Slicers: `view.slicers`, with chip rows above the table that set `view.filter[col]`, in src/components/sheets/BlankSheet.tsx and src/actions/sheets.ts (view validation)
- [X] T055 [US6] Advanced filter dialog (AND/OR groups, unique only, filter in place or copy to a new sheet) in src/components/sheets/format/AdvancedFilter.tsx, plus `filter.advanced` in src/lib/sheet-rules.ts
- [X] T056 [P] [US6] Pure outline helpers (groups by ids, levels 1–8, collapsed → hidden ids) in src/lib/sheet-outline.ts, with pure checks
- [X] T057 [US6] Outline bar beside the row numbers and above the letters (brackets, +/−), Shift+Alt+→ and ← to group and ungroup, and Data › Group, in src/components/sheet/GridCore.tsx and src/components/sheets/BlankSheet.tsx, stored in `view.outline`
- [X] T058 [US6] Status-bar math: Sum, Average and Count over the numeric cells of every area (capped at 50k, debounced), with Min and Max switches from the status bar's menu kept in `momentum.sheet.stats`, on blank and linked sheets, in src/components/sheets/Workbook.tsx, src/components/sheets/BlankSheet.tsx and src/components/sheet/useLinkedFormats.ts
- [X] T059 [US6] Lab checks for US6 (quickstart Stage B §3–§4), then the stage B regressions, docs and PR, in scripts/spreadsheet-lab/realapp/tips-b.cjs

**Checkpoint**: stage B is done.

---

## Phase 9: User Story 7 - Moving and copying with the mouse (P3)

**Goal**: drag a border to move, copy, insert or insert a copy; a right-drag paste menu; Alt+drag to another sheet.

**Independent Test**: B2:C5 dragged to E2 moves cells, formats and comments in one undo; a move that splits a merge is refused (spec US7).

- [X] T060 Write the stage C HTML design (border-drag cursor and outline, right-drag menu, Alt+drag over a tab, Protection tab in Format Cells, print view and its options) in design/power-tips-c.html, and get approval
- [ ] T061 [US7] Border drag in the grid: hit-test 4 px around the selection outline, a ghost target, Ctrl/Shift/Ctrl+Shift modes, right-drag menu, calling `onMove`, in src/components/sheet/GridCore.tsx
- [ ] T062 [US7] BlankSheet `onMove`: one step moving or copying cells, formats, comments and merges inside the block, with insert shifting; refused when it would split a merge or a table, in src/components/sheets/BlankSheet.tsx
- [ ] T063 [US7] Alt+drag over a sheet tab: `onMoveToSheet` in the Workbook applies a clear here and a write there, one step on each sheet's stack, in src/components/sheets/Workbook.tsx and src/components/sheets/TabBar.tsx
- [ ] T064 [US7] Lab checks for US7 (quickstart Stage C §1) in scripts/spreadsheet-lab/realapp/tips-c.cjs

---

## Phase 10: User Story 8 - Protecting inputs and printing (P3)

**Goal**: locked and unlocked cells while a sheet is protected; Print / PDF with repeated header rows and fit to width.

**Independent Test**: with B2:B20 unlocked and the sheet protected, a member types in B2 (saved) and A2 (refused); a 120-row print repeats the header row (spec US8).

- [ ] T065 [US8] `CellStyle.unlocked` in src/types/index.ts, and a Format Cells → Protection tab with a Locked checkbox
- [ ] T066 [US8] Server: while protected, a non-protector non-admin may send only a `cells` change whose cells all resolve to unlocked, in src/actions/sheets.ts; the client `readOnlyNote` mirrors this in src/components/sheets/BlankSheet.tsx
- [ ] T067 [P] [US8] Print view of the used range or the selection (cell looks, `<thead>` repeat rows, fit to width, orientation, gridlines) in src/components/sheets/print/PrintView.tsx, opened from File › Print (print CSS in src/app/globals.css)
- [ ] T068 [US8] Lab checks for US8 (quickstart Stage C §2–§3), then the stage C regressions, docs and PR, in scripts/spreadsheet-lab/realapp/tips-c.cjs

**Checkpoint**: all eight stories are done.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T069 [P] Write the SC-001 coverage table (each of the 120 tips: available, new, formula-free equivalent, later formulas spec, or out of scope, with a reason) in specs/020-excel-power-tips/validation.md
- [ ] T070 [P] Add a sheet power tips section (keys, fill handle, validation, cleanup, tables, outline, locks, print) to HANDOVER.md
- [ ] T071 Run the full regression set from quickstart.md (all realapp labs, lab:sheet, lab:spreadsheet), plus Arabic and phone axe runs, before each stage's PR

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: start immediately. T001's approval blocks the stage A UI tasks.
- **Foundational (Phase 2)**: depends on Setup and blocks every story.
- **Stage A (US1 → US2 → US3)**: they share GridCore, so they run in order. Their pure tasks ([P]) can start right after Phase 2.
- **Stage B (US4, US5, US6)**: needs T037 approved and stage A merged. The stories touch different files apart from BlankSheet and FormatToolbar, so the pure tasks (T038, T045, T046, T056) can run in parallel.
- **Stage C (US7, US8)**: needs T060 approved and stage B merged. US8's print view (T067) is independent of US7.
- **Polish**: after each stage (T071) and at the end (T069, T070).

## Parallel Examples

- **Stage A:** T010 (goToSpecial), T019 and T020 (sheet-fill), T028 (fill lists server) and T031 (validations table) are different files and can run together.
- **Stage B:** T038 (numfmt), T045 (clean), T046 (wildcards) and T056 (outline) are pure libraries that can run together.
- **Stage C:** T067 (print view) can run alongside T061–T063 (border drag).

## Implementation Strategy

- **MVP** is stage A, US1 first. Navigation and Go to special are useful on their own, then the fill handle (US2), then drop-downs (US3). Stage A ships as one PR after its lab passes, and is merged on the user's word.
- **Then** stages B and C follow, each starting with its design approval and ending with its PR.
- **Every task** keeps undo at one step per command, and follows the spec 013 limits and the sheet's protection.
