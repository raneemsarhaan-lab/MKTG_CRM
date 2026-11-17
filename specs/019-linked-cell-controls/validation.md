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
