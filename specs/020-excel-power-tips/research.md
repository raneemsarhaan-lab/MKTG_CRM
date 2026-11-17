# Research: Excel Power Tips in the Sheets

Each decision lists what was chosen, why, and the alternatives considered.

## R1. Go to special (tips 7, 68, 70)

- **Decision:** `GridCore` gets `selectAreas(areas: GridRect[])`, the many-area form of `selectRect`. The host computes the areas:
  - **Blanks:** empty cells in the used range.
  - **Filled:** non-empty cells.
  - **Visible only:** the selection minus hidden and filtered rows. Hidden rows are already left out of `vRows`, so this mostly marks copy to skip them; see R2.
  - Cells are folded into maximal runs per row, then merged vertically into rectangles, capped at spec 017's 100 areas. Past the cap, it says so.
- **Rationale:** it reuses the spec 017 multi-area model, so Ctrl+Enter, clear and formats already work on the result. That is exactly tip 68 (fill blanks).
- **Alternatives:** a separate "marked cells" model was rejected, because every tool would need to learn it.

## R2. Copy visible cells only (tip 70)

- **Decision:** the blank sheet's grid indexes are already over visible rows (spec 015 stage 2), so copying a filtered block never includes hidden rows. The command makes this explicit and announces "visible cells only".
- **Alternatives:** none needed. It is a menu path and a message.

## R3. Repeat last action, F4 (tip 93)

- **Decision:** the blank sheet records the last *repeatable* command: a `FormatCmd`, an insert or delete of rows or columns, a fill, clear formats, or a cleanup tool. F4 (Ctrl+Y when the redo stack is empty, as in Excel) runs it again on the current selection. Typing and undo are not repeatable.
- **Rationale:** `runFormat` already funnels the toolbar commands, so recording `cmd` there is enough.

## R4. The fill handle (tips 13, 101–106)

- **Decision:** `GridCore` draws an 8 px handle at the end corner of the newest area (single area only).
  - **Pointer drag** shows a dashed target outline and the series preview tooltip, then calls `onFill({ from: rect, to: rect, mode, insert })`.
  - **Modes:** copy, series, formats, noFormats, weekdays, months, years.
  - **Dragging inside the source** sets `mode: 'clear'`.
  - **Shift** sets `insert`.
  - **Right-button drag** opens the mode menu on release.
  - **Double-click** fills down to the last row with data in the column beside it.
  - **After a fill**, an "Auto Fill Options" button stays by the target until the next action and re-runs the last fill with another mode. Re-running = undo + apply, one step.
- **Series rules** (`sheet-fill.ts`, pure):
  - numbers continue the step of the source;
  - text ending in a number ("Item 3") counts on;
  - dates step by the source's day, month or year step;
  - weekdays skip the workspace weekend (default Friday–Saturday);
  - month and day names continue in their language (English or Arabic, long or short);
  - items of an admin's custom list continue the list.
  - Ctrl swaps copy and series, as in Excel.
- **Linked sheets:** the fill goes through `writeCells(writes, 'fill')`, so each cell keeps its own rules and refusals are counted.

## R5. Flash Fill, Ctrl+E (tip 14)

- **Decision:** a pure learner over the examples in the column (1–2 rows typed next to the source columns).
  - **Candidate programs:** concatenations of tokens from the source cells. Tokens come from splitting on spaces, punctuation and @, optionally with a case change, plus literal separators.
  - **Search:** small (≤ 3 tokens per output), keeping programs consistent with every example.
  - **Result:** if exactly one program's outputs differ from the others, or all programs agree, the empty cells below are filled. Otherwise it fills nothing and says "Give one more example".
- **Rationale:** it covers the common cases in the reference (first names, domains, initials, joining) with no guessing.

## R6. Data validation (tip 18) and Alt+Down (tip 19)

- **Decision:**
  - **Storage:** `sheet_validations` rows hold the range by row and column ids, like merges, plus `values` (≤ 100), optional colors, and `mode: 'reject' | 'warn'`.
  - **Display:** a validated cell shows a chip (with a color when set) and a ▾. Enter or a click opens `SheetMenu` with the values.
  - **Checking:** `writeCells` and `onCommit` check typed, pasted, filled and moved values against the list. Rejected ones are counted as `invalid`.
  - **Structure:** inserting rows inside the range grows it. Deleting edge rows shrinks it, the way `tablesAfter` already works.
- **Alt+Down** on any text cell opens a type-ahead of the column's distinct values. It reuses `SheetCombo` from spec 010 and the values from `columnValues`.

## R7. Custom number formats (tips 23–25)

- **Decision:** `NumberFormat.kind = 'custom'` with `pattern`. `sheet-numfmt.ts` supports this subset of the Excel grammar:
  - up to 3 sections (`pos;neg;zero`, with `;;;` hiding the value);
  - `0` and `#` digits;
  - the `,` thousands separator;
  - trailing `,` for ÷1,000 and `,,` for ÷1,000,000;
  - decimals;
  - quoted literals and `\x`;
  - `%`.

  Unsupported tokens are refused in the dialog, which explains what isn't supported. Ctrl+Shift+1 sets `number` with 2 decimal places and a separator.
- **Rationale:** it covers the reference's examples exactly, and keeps `display()` pure and fast.

## R8. Center across selection (tip 26)

- **Decision:** `ha: 'across'`. When rendering, a non-empty cell with `across` lays its text over the following empty cells of the same row that also carry `across`, like a visual merge. Nothing is merged, so sort and select keep working.

## R9. Whole-row conditional formats and icon sets (tips 27–28)

- **Decision:**
  - **Whole row:** a rule's `args.row = true` applies the look to every cell of a row when the rule's own column matches. This is the formula-free form of `=$D2>1000`.
  - **Icon sets:** new kind `icons` with `args.set` (arrows3, flags3, lights3) and thresholds by percent or number, like the scales.

## R10. Cleanup tools (tips 52, 54, 55, 61–63, 66, 67)

- **Decision:** `sheet-clean.ts` returns plans; BlankSheet turns each into one undo step.
  - **Remove duplicates:** key = the chosen columns' normalized text. Keep the first, delete the rest (`deleteRows`). Count shown first.
  - **Split to columns:** split by a delimiter (comma, semicolon, space, tab, custom) or by fixed widths. A preview shows first. It writes into the next columns and inserts columns when they hold data, after a confirm.
  - **Trim/Clean, Change case, Text→Number:** cell rewrites.
  - **Find wildcards** in `sheet-tools.matches`: `*`, `?`, `~*`, `~?`.
  - **Paste Special Add/Subtract/Multiply/Divide:** the clipboard's single number, applied to each numeric cell. Non-numbers are skipped and counted.

## R11. Tables: Ctrl+T, Total row, slicers, advanced filter (tips 71, 73, 74, 78, 79)

- **Decision:**
  - **Ctrl+T** runs `formatAsTable` with the default style.
  - **Total row:** `sheet_tables.totals` stores `{ [colId]: 'sum'|'avg'|'count'|'min'|'max' }`. It is drawn as a sticky footer row below the table's last row. It is computed over the visible rows only, so filters are respected, as in tip 79. It is not a stored cell, so there is nothing to recalculate.
  - **Slicers:** `view.slicers = [{ tableId, col }]`, drawn as chip rows above the table. A click sets the existing `view.filter[col]`, so filters and slicers stay one model.
  - **Advanced filter:** a dialog with condition rows (column, operator, value; AND within a group, OR between groups) and "unique rows only". The result either filters in place (`view.filter` gains an `advanced` entry), or is copied to a new sheet with `createSheet` and the rows' values.

## R12. Outline groups (tip 80)

- **Decision:**
  - **Storage:** `view.outline = [{ kind: 'rows'|'cols', from, to, level, collapsed }]`, by ids, at most 8 levels.
  - **Display:** a thin outline bar beside the row numbers (or above the letters) draws brackets with +/−.
  - **Collapsing** adds the group to the hidden set at render time, separate from manual hiding, so unhide doesn't fight the outline.
  - **Keys:** Shift+Alt+→ groups the selected rows or columns; Shift+Alt+← ungroups.

## R13. Status-bar math (tip 38)

- **Decision:**
  - **Computing:** the Workbook computes Sum, Average and Count over numeric cells in every area (via the host's `onSelect` info), capped at 50,000 cells per computation and debounced at 100 ms.
  - **Min and Max:** switched on from the status bar's own menu; the choice is kept in localStorage (`momentum.sheet.stats`).
  - **Linked sheets:** these report the same numbers through `useLinkedFormats.onSelect`.

## R14. Mouse moves, zoom, locks and print (tips 95, 99, 107–111, 113, 119–120)

- **Border drag:** a pointer down within 4 px of the selection's outline starts a move.
  - **Ctrl** copies, **Shift** inserts, **Ctrl+Shift** inserts a copy, and **right-drag** opens a menu.
  - It becomes one `BlankChange` step: cells, formats, comments, and merges inside the block.
  - It is refused when it would split a merge or a table.
- **Alt+drag to another sheet:** over a tab, the drop calls the Workbook's `moveToSheet`, which applies to both docs as one step on each sheet's stack (clear here, write there). Undo works on each sheet.
- **Double-clicking a cell edge:** a double-click within 4 px of the active cell's edge runs `dataEdge` in that direction (spec 013).
- **Zoom:**
  - **Ctrl+wheel and Ctrl+=/−/0** scale the grid with CSS `zoom` on the grid wrapper. Hit-testing stays native.
  - **Kept:** per member and sheet, in localStorage.
  - **Shift+wheel:** in Chromium, it already scrolls sideways; the grid forwards `deltaY` to `scrollLeft` where the browser doesn't.
- **Locks:**
  - **Where it lives:** `CellStyle.unlocked = true` marks input cells. It is set in Format Cells → Protection.
  - **Server:** while protected, `applySheetChanges` allows a non-owner a `cells` change only when every cell resolves to unlocked. Every other change kind stays refused.
  - **Client:** `readOnlyNote` mirrors the server's rule.
- **Print:**
  - **What prints:** `PrintView` renders the used range (or the selection) as a static table with the cell looks. Rows marked "repeat" go in `<thead>`, which browsers repeat on each page.
  - **Fit to width** scales the table to the page width; orientation is set via `@page`.
  - **How:** File › Print opens the browser dialog (Save as PDF included).
