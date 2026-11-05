---
description: "Task list for Sheet Columns You Can Shape"
---

# Tasks: Sheet Columns You Can Shape

**Input**: Design documents from `specs/010-sheet-custom-columns/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: As in specs 008, 009 and 006, each story ends with lab scenarios. The existing 111 sheet-lab checks are the regression gate for both sheets.

**Conventions**

| Term | Meaning |
|---|---|
| Lib | `src/lib/sheet-columns.ts` (pure) |
| Actions | `src/actions/sheet-columns.ts` |
| Grid core | `src/components/sheet/GridCore.tsx` |
| Video | `src/components/sheet/VideoSheet.tsx` + `SheetGrid.tsx` |
| Content | `src/components/content/ContentSheet.tsx` + `ContentGrid.tsx` |
| Board | `src/components/kanban/KanbanBoard.tsx` (host for both sheets) |
| Lab | `scripts/sheet-lab/`, `npm run lab:sheet` |
| Strings | `useTranslations('sheet')` → `sheet.columns.*`, English and Arabic in the same task |
| Colours | `SHEET_UI`, `CHOICE_COLORS` and `--sheet-*` only |

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Create `design/sheet-columns.html` (contracts/columns-ui.md), over the Content sheet with a note for the Video sheet's sets. Show:
  - the header ▾ menu;
  - drag indicator and resize handle;
  - the Columns panel with "Changed by" tooltips;
  - the column editor for each kind, including Choice options and the kind-change review;
  - every custom cell kind;
  - the delete confirmation and Undo toast;
  - the paste preview's Not imported list.

  Publish it as an artifact, then commit it.
- [ ] T002 [P] Lab fixtures in `scripts/sheet-lab/column-fixtures.ts`:
  - column records for both sheets: a renamed built-in, a moved built-in, a hidden built-in, and custom Text, Number, Date, Link, Person, Choice and Checkbox columns;
  - values on several pieces and clips;
  - a deleted custom column;
  - members including a `user` and an admin.

---

## Phase 2: Foundational (blocks every story)

- [ ] T003 In `prisma/schema.prisma`, add `SheetColumn` and `SheetValue` with their relations (data-model §1): `Member` updated_by and created_by, `Task` values. Run `npx prisma generate` and `bash scripts/migrate.sh`.
- [ ] T004 [P] In `src/types/index.ts`, add `SheetId`, `ColumnKind`, `ChoiceOption`, `SheetColumnRecord` and `SheetValues`. In `src/lib/mappers.ts`, add `mapSheetColumn`.
- [ ] T005 [P] `CHOICE_COLORS` in `src/lib/tokens.ts`: 10 colours, each with white text at AA contrast or better.
- [ ] T006 [P] The `sheet.columns.*` strings in `messages/en.json` and `messages/ar.json`:
  - header menu, Columns panel, column editor, kinds and their one-line descriptions;
  - cell notes, the delete confirmation and Undo;
  - paste problems and Not imported;
  - errors (`name_taken`, `limit`…), "Changed by {name}, {when}".
- [ ] T007 The Lib (data-model §3, research R3, R4, R12): `applyLayout`, `parseValue`, `formatValue`, `checkName`, `headingKey`, `nextChoiceColor`, plus `BUILT_IN_COLUMNS` for both sheets (keys, default widths, default sets).
- [ ] T008 Actions per contracts/server.md:
  - the advisory lock per sheet;
  - writing built-in records on the first layout change;
  - `updated_by` on every change;
  - the row rule for values.
- [ ] T009 Loader and host:
  - `src/app/(app)/board/page.tsx` loads columns (with updater names) and values;
  - Board passes `sheetColumns` and `sheetValues`, split by sheet, plus a `ColumnsApi` (optimistic, rolled back on failure) to Video and Content.
- [ ] T010 Apply the layout in both sheets:
  - Video `cols` = `applyLayout(...)` for the current set, with names and widths;
  - Content the same with set `all`.

  Check: no records gives exactly today's columns. The existing 111 lab checks pass unchanged.
- [ ] T011 Lab Node checks in `scripts/sheet-lab/pure.mjs`:
  - `cols-layout` (defaults, positions, new built-in inserted, deleted hidden, Title first, Video sets);
  - `cols-parse` (every kind, both date forms, links, persons, choices);
  - `cols-names`, `cols-headings`;
  - tokens-only extended to the new files;
  - messages parity for `sheet.columns`.

**Checkpoint**: schema applied, the layout drives both grids, and today's sheets look and behave as before.

---

## Phase 3: User Story 1: rename any column (P1) 🎯 MVP

- [ ] T012 [US1] In the Grid core:
  - the header ▾ button (`data-col-menu`), shown on hover and focus;
  - `Alt+↓` from a cell opens its column's menu;
  - a `headerMenu(col, anchor)` model hook.
- [ ] T013 [US1] `src/components/sheet/ColumnMenu.tsx` builds the header-menu items (contracts §3). Rename opens an inline name popover (`SheetPopover`) with `checkName` errors. Reset name is shown for renamed built-ins. Wire both sheets.
- [ ] T014 [US1] Lab scenarios `col-1-*`:
  - rename Status;
  - other members see it (stub reload);
  - built-in behaviour is unchanged;
  - empty and duplicate names are refused;
  - Reset restores the Arabic default.

---

## Phase 4: User Story 2: add a column of your own (P1)

- [ ] T015 [US2] `src/components/sheet/ColumnEditor.tsx`:
  - name and kind (radio group with icons);
  - Choice options (name, swatch, order, remove, + Option);
  - add, or insert before or after a column (from the header menu).
- [ ] T016 [US2] `src/components/sheet/CustomCell.tsx`: render each kind (contracts §6), and the host-side edit for Link (`LinkPrompt`), Person (person menu), Choice (pill menu, Clear) and Checkbox (toggle). Text, Number and Date go through the grid's own text editing. Refused values leave a cell note.
- [ ] T017 [US2] Wire custom cells into the Video and Content models:
  - `isText`, `textValue`, `isMenu`, `onCommit`, `onOpen`, `onActivate` (checkbox), `onDelete` (clear);
  - read-only rules;
  - no custom cells on theme and pillar rows.

  Wire **+ Column** in both toolbars.
- [ ] T018 [US2] Lab scenarios `col-2-*`:
  - add Text and Choice, fill them, values persist;
  - Number, Date and Link refuse bad values;
  - Person and Checkbox;
  - a `user` may not edit a row they don't hold;
  - Video clip and video rows both have the cells;
  - the 30-column limit.

---

## Phase 5: User Story 3: rearrange columns (P1)

- [ ] T019 [US3] In the Grid core: draggable headings (not Title), a drop indicator, and `onReorder(col, beforeCol)`. Right to left mirrored. No drag on touch.
- [ ] T020 [US3] Move left and Move right in the header menu. `src/components/sheet/ColumnsPanel.tsx` lists columns in order with Move up and Move down, shown ticks, the "Changed by" description (FR-004) and + Column. Add a **Columns** button in both toolbars.
- [ ] T021 [US3] Lab scenarios `col-3-*`:
  - drag Assignee after Title;
  - keyboard moves through the panel;
  - Title can't be passed;
  - Video sets share the order;
  - clip timings and the status menu work after moves.

---

## Phase 6: User Story 4: hide, show and delete (P2)

- [ ] T022 [US4] Hide from the header menu, and show from the Columns panel. On Video, the change applies to the current set (`setColumnShown`).
- [ ] T023 [US4] Delete a custom column: a confirmation with the count of values, a soft delete, and an Undo toast for 10 s (`restoreColumn`). Built-in columns offer no Delete.
- [ ] T024 [US4] Lab scenarios `col-4-*` and `vcol-4-*`:
  - hide Pillar for everyone;
  - show it again;
  - hide Source in Editing only;
  - delete with the count;
  - Undo restores the values;
  - editing a cell of a deleted column says "removed".

---

## Phase 7: User Story 5: change a custom column's settings (P2)

- [ ] T025 [US5] Edit column in `ColumnEditor`:
  - options: add, rename, recolour, reorder;
  - removing an option in use asks for a replacement or Clear (`replace`);
  - a kind change previews the values that won't fit, then confirms;
  - `updateColumn` converts the values in a transaction.
- [ ] T026 [US5] Lab scenarios `col-5-*`.

---

## Phase 8: User Story 6: resize columns (P3)

- [ ] T027 [US6] In the Grid core: a resize handle with pointer drag (clamped 60–600), double-click fit (`fitWidth`), and `onResize` → `resizeColumn`. Mirrored in right to left.
- [ ] T028 [US6] Lab scenarios `col-6-*`.

---

## Phase 9: User Story 7: paste into custom columns (P3)

- [ ] T029 [US7] Content:
  - `parse-plan.ts` matches headings by current names through `headingKey`, and reads custom values;
  - `PlanPreview.tsx` lists bad values as problems, and Not imported headings with "Add as a column";
  - `addPlan` takes `custom` per row and writes values in its transaction.
- [ ] T030 [US7] Video: the same in `parse-clips.ts`, `PastePreview.tsx` and `addClips`.
- [ ] T031 [US7] Lab scenarios `col-7-*` and `vcol-7-*`: 18 rows with 3 custom columns (54 values, SC-006); a bad value; Not imported → Add as a column.

---

## Phase 10: Polish

- [ ] T032 [P] Lab scenarios `cols-kbd` (everything from the keyboard: the panel, Alt+↓, the editor), `cols-rtl`, `cols-phone`, `cols-axe`.
- [ ] T033 Run:
  - `npm run typecheck`;
  - `bash scripts/preflight.sh`;
  - `next build`;
  - `lab:sheet`, `lab:inbox`, `lab:attachments` and `lab:brief`.
- [ ] T034 Running-app checks (quickstart §2) with two members on local PostgreSQL. Record the results in `specs/010-sheet-custom-columns/validation.md`.
- [ ] T035 [P] `specs/010-sheet-custom-columns/constitution-check.md` (the §III decision: every member may shape the layout), and a "Sheet columns" section in `HANDOVER.md`.

---

## Dependencies

- **Setup** (T001, T002) → **Foundational** (T003–T011) → **US1** (the header menu) → US2–US7.
  - T010 must keep the existing 111 lab checks green before any column UI.
  - T001 blocks the UI tasks.
- **US2** before US5 (settings edit what US2 creates) and US7 (paste fills custom columns).
- **US3, US4 and US6** depend on US1 only.
- **Polish** last.

**Parallel**: T004–T006 together; T019 (drag) alongside T015–T016; T027 (resize) alongside T022–T023; T029 alongside T030.

## Implementation strategy

1. **MVP**: Foundational and US1. A shared layout drives both sheets, and any column can be renamed.
2. **US2 + US3**: add your own columns and rearrange. Together with US1, this is the "like a spreadsheet" core.
3. **US4–US7**: hide and delete, settings, resize, paste.
