# Validation: Spreadsheet-Style Sheet Toolbar

**Date**: 2026-11-16, against `next build` + `next start`, local PostgreSQL.

## New lab: `scripts/spreadsheet-lab/realapp/header.cjs`, 45/45

- **Layout**
  - The menu bar has 7 menus.
  - The strip's groups and tools are in the familiar order.
  - The strip is one 40 px row.
  - Board ▾ and Comments sit in the title row.
- **US1, the strip**
  - Currency, 0 decimals, bold, fill, centre, middle and wrap, all from the strip.
  - The cell shows "EGP 1,250", and the align icon follows the choice.
  - Eight undos clear the eight steps.
  - Size + gives 11, typing gives 14, and − gives 13.
- **US2, the menu bar**
  - View › Freeze › 1 row, Insert › Row above, Edit › Fill down, Format › Conditional formatting ▸, and Data › Create a filter.
  - File opens the sheet's commands, and Data › Board ▸ opens the Board menu.
  - The arrow keys move along the bar, and Arrow down opens a menu.
- **US3, the name box and cell bar**
  - The name box and count show "B8:D9 · 6 cells".
  - Typing D20 or B2:C5 jumps there; other text is refused with a note.
  - The cell bar shows, saves (one undo) and cancels with Esc, and focus returns to the grid.
- **Alt+/ and Ctrl+/**: Alt+/ finds "View › Freeze › …", and Ctrl+/ lists the shortcuts.
- **SC-002**: every control from the old toolbar can still be reached, including Underline (Format › Text) and indent (the align ▾).
- **FR-003, narrow window**: at 860 px, groups move under ⋮ and the strip stays one row. They come back at 1360 px.
- **Content sheet**
  - It has the same header.
  - Its name box names the cell and is read-only.
  - Insert explains where rows are added.
- **Arabic and axe**: the menu names are in Arabic, and axe is clean on the header and menus in English and Arabic.

## Regressions

Selectors were updated where a control moved into the menu bar (`realapp/toolbar.cjs`).

| Lab | Result |
|---|---|
| realapp areas | 42/42 (Ctrl+D check intermittent, also before this change) |
| realapp run / editing / format / styles / links / perf-axe | 56 / 50 / 52 / 54 / 40 / 18 |
| lab:sheet | 150/150 (one intermittent "Space expands it", passes on rerun) |
| lab:spreadsheet / lab:notify | 28/28 · 46/46 |
| `tsc --noEmit`, `next build` | pass |

## Found and fixed while testing

- **Comments panel.** It covered the Comments button once the button moved to the title row. The panel now opens below the title row.
- **Name box.** A click now selects its text, so typing replaces it as in a spreadsheet.
- **Shortcuts dialog.** It now closes with Esc wherever focus is.
- **Screen-reader names.** Each tool's accessible name now includes its visible text (axe label-content-name-mismatch).

## Differences from the design

- Wrapping offers Wrap and Clip. Sheet cells don't overflow into their neighbours, so there is no Overflow choice.
- The cell bar is one line; use the cell itself for line breaks (Alt+Enter).
