# Validation: Select Separate Cells with Ctrl+Click

**Date**: 2026-11-16 · against `next build` + `next start`, local PostgreSQL.

## New lab: `scripts/spreadsheet-lab/realapp/areas.cjs`, 42/42 (three clean runs)

- **Pure helpers (7)**
  - unique-cell count, with overlaps counted once;
  - subtract, which splits a block into 4 pieces;
  - copy layouts: side by side, stacked, or refused;
  - area names (C:C, 3:5).
- **US1 (9)**
  - Ctrl+click and Ctrl+drag give 3 areas and 8 cells, with the status "B2, E5, B8:D9 · 3 areas, 8 cells".
  - The letters of every area light up.
  - Ctrl+click on a selected cell takes it out, and Ctrl+drag over selected cells takes the block out.
  - Shift+click resizes only the newest area; a plain click goes back to one cell.
  - Ctrl+click on a letter adds a whole column; Ctrl+A makes one area.
- **US2 (6)**
  - Bold changes exactly the 8 selected cells, and one undo reverts them.
  - Delete clears every area and nothing else, and one undo restores it.
  - Ctrl+Enter fills 3 cells, and one undo reverts it.
- **US3 (5)**
  - Areas over the same rows copy side by side as one block.
  - Areas that don't line up refuse to copy, with the message.
  - Cut refuses with several areas.
  - One copied cell pastes into every area; a copied block refuses.
- **US4 (4)**
  - Sort & Filter is disabled and says why.
  - Ctrl+D says it needs one area.
  - The cell menu explains Cut, Insert and Delete rows.
- **Whole rows (2)**: Ctrl+click on row numbers, then Delete 2 rows deletes both; one undo brings them back.
- **US5 (3)**
  - Shift+F8 shows Add to selection.
  - Arrows keep the first area and Shift+arrows add a second: "A25:B25, D25:D26 · 2 areas, 4 cells".
  - Esc ends the mode, and the keyboard-made areas take Bold.
- **Content sheet (2)**: Ctrl+click selects 2 separate cells; the one-area tools say why.
- **SC-003 (3)**
  - 100 areas on a 2,000-row sheet.
  - The 101st shows the limit.
  - A Ctrl+click with 99 areas paints in 18–23 ms, two animation frames included, so well under 50 ms.
- No page errors.

## Regressions (unchanged labs)

| Lab | Result |
|---|---|
| realapp run | 56/56 |
| realapp editing | 50/50 |
| realapp format | 52/52 |
| realapp styles | 54/54 |
| realapp links | 40/40 |
| realapp perf-axe (axe on menus, speed) | 18/18 |
| lab:sheet | 150/150 |
| lab:spreadsheet | 28/28 |
| lab:inbox | 30/30 |
| `tsc --noEmit`, `next build` | pass |

## Notes

- **Ctrl+Enter.** Alt+Enter still adds a line break inside a cell. Ctrl/Cmd+Enter now fills the selection, as in Excel; before, it also added a line break.
- **Typing keeps the selection.** Typing no longer drops the selection, so Ctrl+Enter can fill it. Enter still saves the one cell and moves down, which collapses the selection as before.
- **Create tasks for rows.** Board ▾ → Create tasks for rows takes the rows of every area. This is a change from the design, where it was a one-area tool.
- **Linked sheets status line.** The linked sheets keep their own toolbar hint. Their selection is shown by the highlight only, because those sheets have no A1-style names.
