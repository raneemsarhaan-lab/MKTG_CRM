# Implementation Plan: Excel Power Tips in the Sheets

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `020-excel-power-tips`) | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Designs** (one per stage, each approved before it is built):

- `design/power-tips-a.html` (US1–US3)
- `design/power-tips-b.html` (US4–US6)
- `design/power-tips-c.html` (US7–US8)

## Summary

The spec's eight stories are built in three stages, each with its own design, PR and lab.

**Most of the work is client-side.** It goes into:

- the shared grid (`GridCore`): new keys, the fill handle, border drag, zoom, Go to special;
- the blank sheet host (`BlankSheet`), which turns each gesture into the `BlankChange` steps undo already understands;
- a set of pure libraries:
  - `sheet-fill.ts`: series and Flash Fill;
  - `sheet-clean.ts`: dedupe, split, trim, case, numbers;
  - `sheet-numfmt.ts`: the custom number formats;
  - `sheet-outline.ts`: outline groups.

**Server changes are small.** Data validation gets a table. Tables get a totals column. Workspace settings hold the custom fill lists. Cell locks join the formats. Outline groups and slicers join the sheet's stored `view`.

**No formulas** (spec Q1, left to a later spec). **No pivots or charts** (Q2).

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router, Prisma 5 + PostgreSQL.
**Primary Dependencies**: none new. Print uses the browser's print dialog.
**Storage**:
- **New table** `sheet_validations`.
- **New columns:** `sheet_tables.totals` (JSON) and `workspace_settings.fill_lists` (JSON).
- **New JSON keys:** `sheets.view.outline` and `sheets.view.slicers`.
- **New format fields:** `CellStyle.unlocked`, `CellStyle.ha = 'across'`, `NumberFormat.kind = 'custom'`, and rule kinds `icons` and `row`.
- **Per member in the browser (localStorage):** zoom and status-bar preferences.

**Testing**: three new real-app labs, `realapp/tips-a.cjs`, `tips-b.cjs` and `tips-c.cjs`, plus pure checks in `lab:spreadsheet`. All earlier labs are re-run every stage (SC-004).
**Target Platform**: desktop browsers. Phones get the menu paths (spec Edge Cases).
**Performance Goals**:
- A 1,000-cell series fill shows in under 1 s and is one undo step (SC-003). The fill is computed in one pass and applied as one `cells` change.
- Go to special scans only the used range.
**Constraints**:
- English and Arabic.
- RTL drag directions.
- Tokens only.
- One undo step per command.
- Spec 013 limits: 5,000 rows and 200 columns.

## Constitution Check

- **I. Design System Fidelity**: tokens only. The new controls (handle, Auto Fill button, slicers, outline bar, status bar) reuse the existing sheet tokens.
- **II. Pipeline Integrity**: untouched. On the Content and Video sheets, fill and pick go through each cell's own save path (`writeCells` → `commit`), so stage moves keep the board's rules.
- **III. Role-Based Access**: custom fill lists are edited by admins only (UI hidden and server-checked). Cell locks are honored server-side while a sheet is protected.
- **IV. Design-Driven**: each stage starts with an HTML design for approval.
- **V. Celebrations**: untouched.
- **VI. State**:
  - Server state goes through actions.
  - Zoom and status-bar choices are UI preferences in localStorage, read after mount and wrapped in try/catch; the view renders without them.

**Gate: passes.** Post-design re-check: still passes. The new table and columns are additive, and old rows read as before.

## Stages

| Stage | Stories | Tips | Main files |
|---|---|---|---|
| **A** | US1 keyboard and view, US2 fill handle and quick entry, US3 drop-downs and pick | 7, 8, 13–15, 17–20, 68, 70, 92, 93, 98, 101–106, 113, 119, 120 | GridCore, BlankSheet, `sheet-fill.ts`, `sheet_validations`, Settings (lists), Shortcuts dialog |
| **B** | US4 formats, US5 cleanup, US6 tables, totals, slicers, outline, status bar | 23–28, 30, 38, 52, 54, 55, 61–63, 66, 67, 71, 73, 74, 78–80 | `sheet-numfmt.ts`, `sheet-rules.ts`, `sheet-clean.ts`, `sheet-outline.ts`, tables, Workbook status |
| **C** | US7 mouse moves, US8 locks and print | 95, 99, 107–111 | GridCore border drag, BlankSheet move, `protectSheet` and the write checks, print view |

## Project Structure

### Documentation (this feature)

```text
specs/020-excel-power-tips/
├── spec.md
├── plan.md          # this file
├── research.md      # decisions R1–R14
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── server.md    # actions and stored shapes
│   └── grid.md      # GridCore and host hooks
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/lib/sheet-fill.ts            # new: series detection, steps, dates/months/weekdays (workspace weekend), custom lists, Flash Fill
src/lib/sheet-clean.ts           # new: dedupe keys, split preview, trim/clean, case, text→number, blanks-from-above
src/lib/sheet-numfmt.ts          # new: custom format subset (#,##0 · decimals · "K"/"M" scaling · literals · ;;; sections)
src/lib/sheet-outline.ts         # new: outline groups → hidden rows/cols, levels
src/lib/sheet-format.ts          # display(): custom formats, 'across' alignment; locks in resolveStyle
src/lib/sheet-rules.ts           # rule kinds 'icons' and whole-row ('row' flag)
src/lib/sheet-tools.ts           # find/replace wildcards (* ? ~)
src/lib/sheet-undo.ts            # change kinds: validations, outline, tableTotals (with inverses)
src/lib/sheet-doc.ts             # apply + outbox for the new kinds
src/components/sheet/GridCore.tsx       # keys (Shift/Ctrl+Space, F5, F4 relay, Ctrl+;, Ctrl+E, Alt+Down), fill handle, edge double-click, zoom, wheel, border drag, selectAreas
src/components/sheets/BlankSheet.tsx    # fill/move/cleanup/validation/outline/slicer/total commands → BlankChange steps; repeat-last
src/components/sheets/format/*          # menus: Go to special, Data › Clean up, Data validation, Group, Print; Ctrl+Shift+1; key tips
src/components/sheets/Workbook.tsx      # status bar math, zoom value, F4 relay, Ctrl+F1, print
src/components/sheets/print/PrintView.tsx  # new: used range as a printable table (repeat header rows, fit to width)
src/components/settings/FillLists.tsx    # new: admins' custom lists
src/components/sheet/useLinkedEditing.ts # fill into typable linked cells through writeCells
src/actions/sheets.ts                   # validations, tables.totals, view.outline/slicers, lock-aware protection
src/actions/settings.ts                 # fill lists (admins)
prisma/schema.prisma                    # sheet_validations; sheet_tables.totals; workspace_settings.fill_lists
messages/en.json, ar.json               # sheets.tips.*
scripts/spreadsheet-lab/realapp/tips-{a,b,c}.cjs, pure.mjs
```

**Structure Decision**: this is the existing single Next.js app. New logic goes into pure `src/lib` modules, which can be checked in `lab:spreadsheet` without a browser, and the UI sits on the existing hosts.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| `sheet_validations` table | Ranges must follow inserted and deleted rows and columns, like merges and tables do | Putting them in `view` JSON would lose the row and column id integrity checks that merges and tables have |
| Print view component | The virtualized grid renders only visible rows | Printing the live grid would cut the sheet to one screen |
