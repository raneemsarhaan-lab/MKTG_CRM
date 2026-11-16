# Tasks: Select Separate Cells with Ctrl+Click

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), approved design [design/multi-area-selection.html](../../design/multi-area-selection.html)

## Phase 1: Foundation

- [X] T001 Add `subtract`, `unionCells`, `copyLayout`, `areaLabel`, `selectionLabel`, `wholeRows`, `wholeCols` to src/lib/sheet-selection.ts
- [X] T002 [P] Add `sheets.areas.*` strings (status, add mode, refusals, one-area reason, the 100 cap) to messages/en.json and messages/ar.json
- [X] T003 [P] Add `areas: number` to `FormatState` in src/components/sheets/format/bus.ts

## Phase 2: User Story 1, pick separate cells and blocks (P1)

- [X] T004 [US1] Add the earlier areas (`extra`), `areasNow()` and `onSelect(rect, areas)` to src/components/sheet/GridCore.tsx
- [X] T005 [US1] Ctrl/Cmd+click, Ctrl/Cmd+drag, and Ctrl/Cmd+click on headers and row numbers in src/components/sheet/GridCore.tsx
- [X] T006 [US1] Ctrl+click or drag on selected cells removes them (`subtract`), with the dashed preview, in src/components/sheet/GridCore.tsx
- [X] T007 [US1] Plain moves clear the earlier areas; Shift changes only the newest; Ctrl+A makes one area; the 100-area cap, in src/components/sheet/GridCore.tsx
- [X] T008 [US1] Draw every area, light up headers and row numbers, announce the selection; add `.is-unsel` to src/app/globals.css
- [X] T009 [US1] Status line: BlankSheet `onSelect` label and areas → Workbook status, in src/components/sheets/BlankSheet.tsx and src/components/sheets/Workbook.tsx

## Phase 3: User Story 2, change every area at once (P1)

- [X] T010 [US2] Delete/Backspace clears every area in one `writeCells` in src/components/sheet/GridCore.tsx
- [X] T011 [US2] Ctrl/Cmd+Enter writes the draft into every selected cell in src/components/sheet/GridCore.tsx
- [X] T012 [US2] Blank sheet: patch, paint, cell style, borders per area, Clear*, Clear rules in selection, in src/components/sheets/BlankSheet.tsx
- [X] T013 [US2] Blank sheet rows and columns: Hide, Resize and Delete across areas when every area is whole rows or whole columns, in src/components/sheets/BlankSheet.tsx
- [X] T014 [US2] Linked sheets: formats and clears per area in src/components/sheet/useLinkedFormats.ts and src/components/sheet/useLinkedMenu.tsx

## Phase 4: User Story 3, copy and paste (P2)

- [X] T015 [US3] Copy by `copyLayout`, refuse Cut, paste one cell into every area or refuse a block, via `onNotice`, in src/components/sheet/GridCore.tsx
- [X] T016 [US3] Wire `onNotice` in BlankSheet, ContentGrid and SheetGrid

## Phase 5: User Story 4, one-area tools (P2)

- [X] T017 [US4] Toolbar and style menus: disabled with the reason when `areas > 1`, in src/components/sheets/format/FormatToolbar.tsx and StyleTools.tsx
- [X] T018 [US4] Cell, row and column menus: one-area items disabled with the reason (blank and linked)
- [X] T019 [US4] Host commands guard: merge, fill, paste special, sort, filter, table, new rule; Board ▾ Create tasks for rows

## Phase 6: User Story 5, keyboard (P3)

- [X] T020 [US5] Shift+F8 Add to selection: arrows keep the areas, Shift+arrow starts a new one, Esc ends it; shown in the status line

## Phase 7: Polish and validation

- [X] T021 New lab scripts/spreadsheet-lab/realapp/areas.cjs: gestures, formats, clears, Ctrl+Enter, copy layouts, refusals, menus, keyboard, linked Content sheet, timing (Arabic strings added; RTL not lab-checked)
- [X] T022 Re-run every sheet lab (lab:sheet, lab:spreadsheet, realapp run/editing/format/styles/links/perf-axe) and `next build`
- [X] T023 HANDOVER.md and validation.md; PR
