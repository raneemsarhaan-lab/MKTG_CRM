# Grid Contracts: Excel Power Tips

New optional hooks on `GridModel<R>`. Hosts that don't pass them keep today's behavior.

| Hook | Called when | Host does |
|---|---|---|
| `onFill(f: { from: GridRect; to: GridRect; mode: FillMode; insert: boolean })` | fill handle released; right-drag menu pick; double-click on the handle | blank sheet: `planFill` → one `BlankChange` step. Linked sheets: `writeCells(…, 'fill')` |
| `fillModes?(): FillMode[]` | Auto Fill Options and the right-drag menu | lists the modes that apply (e.g. no `insert` on linked sheets) |
| `onMove(m: { from: GridRect; to: { r: number; c: number }; copy: boolean; insert: boolean; only?: 'values' \| 'formats' })` | border drag released | blank sheet only |
| `onMoveToSheet?(m, sheetId)` | Alt+drop over a tab | Workbook |
| `onRepeat?()` | F4, or Ctrl+Y with nothing to redo | re-run the last repeatable command |
| `onGoToSpecial?(kind: 'blanks' \| 'filled' \| 'visible'): GridRect[]` | F5 → Special (also from the menu) | returns the areas; the grid selects them |
| `pickFromColumn?(row, col): string[]` | Alt+Down on a text cell | distinct values for the type-ahead |
| `validation?(row, col): { values; mode } \| null` | rendering, Enter, typing | chip and ▾; menu of values; checked on commit |
| `zoom?: number` | every render | scales the grid; Ctrl+wheel and Ctrl+=/−/0 call `onZoom(z)` |

## New grid commands (no host hook)

- **Shift+Space / Ctrl+Space:** select the row or column.
- **Double-clicking a cell edge:** jumps like Ctrl+Arrow.
- **Shift+wheel:** scrolls sideways.
- **Ctrl+; / Ctrl+Shift+;:** start editing with today's date or the current time, in the sheet's date format.

## Undo

- Every hook above becomes exactly one undo step on the host's stack.
- On linked sheets, it is one `taskCells` step, as typing and pasting are.
