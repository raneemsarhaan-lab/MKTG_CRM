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

## Follow-up round (after PR #88)

### Running app (`run.cjs`): 56/56

Adds to the checks above:
- The Content sheet's row menu offers New piece, Archive row and Resize row.
- Archive row archives the task, and the workbook's Undo button brings it back.
- Pipeline columns can't be deleted. Insert column opens spec 010's add-column form.
- Dragging a row's edge saves its height for the team, and the height survives a reload.

### Speed and accessibility (`perf-axe.cjs`): 18/18

On a 5,000 × 26 sheet with 20,000 filled cells:

| Check | Result |
|---|---|
| The sheet opens | 0.7–1.4 s; about 40 rows in the page (windowed) |
| Arrow keys (SC-005, under 100 ms) | median 33 ms, p95 34 ms |
| Ctrl+End to row 5,000 | under 100 ms |
| Switching back to a cached tab | about 75 ms, including Playwright's round trip |
| A 1,000 × 20 paste (SC-001, under 3 s) | shown in about 0.1 s; all 20,000 cells saved in about 1.5 s |

Accessibility:
- **axe:** no serious or critical violations on the Sheets home, the workbook, the tab menu, Move or Copy, the cell menu, the linked Content sheet, the workbook in Arabic, and the workbook on a phone.
- **Phone:** the tab bar's targets are 44 px.
- **Fixed in this round:** the folder card's grey text measured 4.36:1 on a hovered card; it now passes 4.5:1.

### Outside this spec (seen by axe, not changed)

The app's shared shell was excluded from these axe runs and has three findings:
- The sidebar's account button: its accessible name doesn't match its visible text (`label-content-name-mismatch`).
- The sidebar's role text is under 4.5:1.
- The phone bar's inactive labels are under 4.5:1.

### As built

- **No `writeTaskCells`.** Linked pastes, clears and undos save each cell through the sheet's existing single-cell save (same permissions and notifications), in parallel batches of 4.
- **Linked Insert row** adds a new clip or piece at the end of that row's video or theme, like "+ Clip" / "+ Piece". A linked row is a task, so it can't be placed between two others.
- **Linked row-height changes** are saved for the team but are not on the undo stack. On blank sheets they are.
