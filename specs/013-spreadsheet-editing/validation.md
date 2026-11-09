# Validation: spec 013

Run on a production build (`next build` + `next start`) against local PostgreSQL, 2026-11-09.

## Running app (`node scripts/spreadsheet-lab/realapp/run.cjs`): 49/49

Two members: an admin (Marketing Manager) and a content creator.

| Area | Checks |
|---|---|
| Home and navigation | Linked folders listed; Sheets in the sidebar; Content and Video pinned by default |
| New folder | One sheet, "Sheet 1"; letter headings |
| Typing | Type into A1; Enter moves down; double-click edits inside the cell |
| Paste | Excel TSV pasted as a block; a quoted line break stays in one cell; the pasted block is selected |
| Undo | Ctrl+Z, Ctrl+Shift+Z, Delete over a range, toolbar Undo |
| Rows and columns | Insert row above and its undo; Delete column and its undo (the cells come back) |
| Saving | Cells and tab order survive a reload |
| Tabs | "+" adds "Sheet 2"; double-click rename; Excel's menu; Tab Color; switching keeps each sheet; drag reorders; Delete; the last sheet can't be deleted |
| Excel menu | Ctrl+Page Up; Hide; Unhide; Move or Copy makes "(2)" with the cells; Protect shows 🔒 |
| Protection | The other member sees it read-only, typing changes nothing, Delete says why, Unprotect is disabled for them |
| Folders | Pin to sidebar; delete hides at once; Undo brings it back; the delete lands after 10 s |
| Linked | The Content folder shows the board's sheet; a paste renames a task; Ctrl+Z puts the name back |
| Console | No errors for either member |

## Labs

| Lab | Result |
|---|---|
| `lab:sheet` (Video and Content sheets on the grown GridCore) | 150/150. `col-2-readonly` was rewritten for R8: a member who can't edit the task can now fill a team column |
| `lab:spreadsheet` (pure modules) | 11/11 |
| Smoke (`scripts/spreadsheet-lab/smoke/run.ts`, server actions on PostgreSQL) | all passed |
| `lab:header` | 24/24 |
| `lab:inbox` | 9/9 node, 30/30 scenarios |
| `lab:notify` | 46/46 |
| `lab:brief` | 55/55 |
| `lab:attachments` | 58/60. `us3-1` and `us3-2` (focus on Undo) also fail on the commit before this work (7bc138b), so they're not from this change |
| `scripts/preflight.sh`, typecheck, `next build` | pass |

Screens were checked by eye on desktop, a 390 px phone and in Arabic.

## Not built in this PR

- **Linked sheets' row and column structure (T042):** insert row as a draft, delete rows (drop or archive), Insert column, and row heights (`setLinkedRowHeights`) from the grid menus. Rows still come from "+ Clip" / "+ Piece" and the drop and archive cells, as before.
- **The workbook toolbar's Undo/Redo on the linked tab:** Ctrl+Z / Ctrl+Shift+Z work in the grid. The buttons are disabled there.
- **`writeTaskCells`:** not added. Linked pastes, clears and undos save each cell through the sheet's existing single-cell save (same permissions and notifications) in parallel batches of 4, rather than one grouped server call.
- **The UI lab (`scripts/spreadsheet-lab` entry, s1–s7, phone, axe and perf scenarios, T017–T047):** the running-app script covers the flows above. A 5,000-row speed run and axe checks are still to do.
