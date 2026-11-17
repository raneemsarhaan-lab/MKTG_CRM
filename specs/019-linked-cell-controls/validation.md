# Validation: Task Fields in Team Sheets (stage 1)

**Date**: 2026-11-17, against `next build` + `next start`, local PostgreSQL.

Stage 1 covers team (blank) sheets. The Content sheet (stage 2) and the Video sheet (stage 3) follow in their own PRs.

## New lab: `scripts/spreadsheet-lab/realapp/fields.cjs`, 58/58

- **US4, linking from ⚙ Fields**
  - The last heading is ＋.
  - The drawer says "Not linked yet" and links through the task column (A).
  - Three rows link, and the drawer names the task column.
- **US6, Match the values**
  - Column B ("Status (our words)") becomes Stage through the column menu.
  - Each distinct value is listed once, with its row count.
  - "idea" is left as text, and keeping the board's stage is the default.
  - The words are saved with the sheet. No task moves, linked rows show the stage pill, and the unlinked row keeps its text.
- **US1, ＋**
  - Assignee, Due date and Design link are added as new columns at the end.
  - Each is named in the headings row and gets a field heading.
  - Unlinked rows stay empty, and an empty link offers "+ link".
- **US2, controls**
  - The stage menu moves the task on the board.
  - The people picker sets the assignee, the date box sets the due date, and the design link shows "Canva".
  - Each one undoes in one step.
- **US6, typing a word**
  - Typing "Editing  in progress" moves the task to D-In Progress, ignoring case and spaces.
  - The cell shows the sheet's word, and undo moves the task back.
- **US6, Values**
  - The matched words are prefilled.
  - A word given to two values is refused.
  - New words are saved.
- **US1, switching a field off**
  - The column goes, and the task keeps its assignee.
  - The switch reads off, and undo brings the column back.
- **Column drag**
  - Dragging Notes onto A's heading makes it column A, and the order is saved.
  - Undo moves it back.
  - Dropping on ＋ moves a column to the end.
- **Group rows by**
  - Theme › Pillar shows bands, with the headings row on top and "Not linked to a task" last.
  - Grouping by a regular column gives North / South / (blank).
  - The grouping is kept after a reload, and No grouping removes the bands.
- **Data › Task fields** opens the drawer.
- **Arabic**: the drawer is mirrored.
- **Phone**: the drawer is a bottom sheet.
- **axe** is clean on the drawer, Match, Values, the stage menu and the grouped sheet.
- No page errors.

## Regressions

| Lab | Result |
|---|---|
| realapp links (spec 016) | 40/40, after a selector update: clicking a field cell now opens its control, so the typing helper presses Esc first |
| realapp areas | 42/42 |
| realapp header | 45/45 |
| realapp run | 56/56 |
| realapp editing | 50/50 |
| realapp format | 52/52 |
| realapp styles | 54/54 |
| realapp perf-axe | 18/18 |
| lab:sheet | 150/150 |
| lab:spreadsheet | 28/28 |

## Changes found while validating

- **Clearing a due date.** The board's `updateTask` refused an empty due date, so undoing a date on a task that had none failed, and so did the date box's Clear. An empty value now clears the date, as the Content sheet already allowed.
- **The hours reminder.** It now waits while the Fields drawer is open, as it already does for dialogs.

## Follow-up (after the first try in TSC Calendar)

- **Link fields on every task.** Working doc, Design link, Post link and Published link now apply to every board task, not only to tasks under a theme (the board lets any task have them). A clip's links are still on its video.
- **Field headings.** A field heading is now the column letter plus a small icon. The field's name is in the tooltip and is read by screen readers. The Task column has a dark ✓ icon.
- Re-run: realapp fields 58/58 (twice), links 40/40.

# Stage 2: the Content sheet, and the task column (2026-11-17)

## What changed

- **The Content sheet uses the fields model.**
  - **Columns and ⚙ Fields** (title row, or Data › Task fields) open the same drawer:
    - Rows: "Content tasks from the board", with Group by (Theme › Pillar, Stage, Assignee, Type, None);
    - a switch, ↑ ↓ and "changed by" for each field (the old Columns panel's keyboard path, spec 010 FR-004);
    - Values for Stage and Type;
    - the team's columns, with "＋ Add a regular column".
  - **Headings and ＋.** Built-in headings carry their field icon. ＋ after the last heading adds a hidden field back, or a spreadsheet column.
  - **The sheet's words.** The Values table is prefilled with the Content sheet's own words (Writing, Editing…). The words and Group by are kept in the sheet's `view`.
  - **Typing and pasting into Status and Type.** These cells take typed and pasted words, which move the task through the board's rules and undo in one step. An unknown word is refused with a note.
- **Team sheets: the task column.**
  - A linked row's Task cell is the task's title only. A pasted link becomes the title, and Refresh keeps the title current. Rows still link by title.
  - A row chosen among same-named tasks keeps its link when the sheet is linked again.
  - "Open task" is gone from the Task cell. The row's ↗ opens the task.
  - A row with no task offers **＋ Create task** (the Create tasks preview for that row).
- **New field: Task link** (team sheets): "Open task ↗" on linked rows and "Create task" on the others. It is read-only.
- **Small fixes:**
  - The ＋ menu now closes after a pick.
  - Field icons are drawn by CSS, so they aren't part of a heading's text.
  - ＋ adds no extra cell to rows that span the grid.

## New lab: `realapp/content-fields.cjs`, 29/29

- **Headings**: field icons, ＋ last, and grouped by Theme › Pillar.
- **Drawer**
  - ⚙ Fields and Columns open the same drawer.
  - It shows Rows: Content tasks, and Group by reads Theme › Pillar.
  - Stage and Type have Values.
  - axe is clean.
- **Hiding and ＋**: Working doc off hides its column. ＋ offers it back, plus a spreadsheet column, and the menu closes.
- **Group by**
  - Stage groups the pieces, and the choice is saved and kept after a reload (axe is clean).
  - None removes the headings.
  - Theme › Pillar comes back.
- **Values**
  - The sheet's words are prefilled.
  - "editing in progress" for D-In Progress is saved.
- **Typing a word**
  - "Editing in  progress" moves the task to D-In Progress, and the pill shows the word.
  - Undo moves it back.
  - "not a stage" is refused with a note.
- **Arabic and phone**: axe is clean in Arabic, and on a phone the drawer is a bottom sheet.
- No page errors.

## Updated labs

- **fields 63/63**
  - No "Open task" in Task cells.
  - Create task appears on the unlinked row.
  - Cells hold titles, not links.
  - The Task link field shows Open task or Create task, and Create task opens the preview.
- **links 41/41**
  - Pasted links become titles.
  - Create task replaces "Not linked".
  - Choose a task keeps the title.
- **lab:sheet 150/150**
  - The Columns panel checks run against the drawer (same hooks; the show checkbox is now a switch).
  - The heading list skips ＋.
- **lab:spreadsheet 28/28**: the links rule now says links apply to every task but a clip (from [#101](https://github.com/raneemsarhaan-lab/MKTG_CRM/pull/101)).

## Regressions

| Lab | Result |
|---|---|
| areas | 42/42 |
| header | 45/45 |
| run | 56/56 |
| editing | 50/50 |
| format | 52/52 |
| styles | 54/54 |
| perf-axe | 18/18 |
