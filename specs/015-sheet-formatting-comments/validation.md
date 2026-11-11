# Validation: spec 015 stage 1 (formatting, number formats, comments)

Run on 2026-11-10 against a production build (`next build` + `next start`) and local PostgreSQL.

## Labs and server checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | builds |
| `npm run lab:spreadsheet` (pure; clipboard in Chromium with real Excel and Google Sheets HTML fixtures) | 18/18 |
| `scripts/spreadsheet-lab/smoke/run.ts` (actions on PostgreSQL: formats, merges, protection, Content sheet, comments, notifications) | all passed; 10,000 cell formats in one call took 237 ms |
| `npm run lab:sheet` (Content and Video sheets, no regressions) | 150/150 |
| `npm run lab:notify` | 46/46 |
| `scripts/spreadsheet-lab/realapp/run.cjs` (spec 013 on the running app) | 56/56 |
| `scripts/spreadsheet-lab/realapp/perf-axe.cjs` (spec 013 speed and axe) | 18/18 |

SC-003 (styles kept on paste): every styled cell in both clipboard fixtures kept its supported styles (11/11 Excel, 6/6 Google Sheets). Pictures, gradients and unknown fonts are dropped silently.

## Running-app checks (quickstart rows 1–14)

`node scripts/spreadsheet-lab/realapp/format.cjs`: **52 passed, 0 failed.**

```
1. Header row: bold, fill, white text, centre, thick bottom border
  ✓ SC-001: header formatted in under 20 s (scripted) 0.9 s
  ✓ the look is the same after a reload 
  ✓ the thick bottom border is drawn 
  ✓ another member sees the same formatting (SC-005) 
2. Currency EGP, 2 decimals; editing shows the value
  ✓ shows EGP 12,500.00 EGP 12,500.00
  ✓ the editor shows 12500 (FR-023) 12500
  ✓ Ctrl+Shift+# shows the long date 
3. Ctrl+A on 5,000 rows: one step, under 1 s, undo restores
  ✓ SC-002: whole sheet formatted in under 1 s, saved after the outbox wait 257 ms on screen, 567 ms saved incl. 400 ms wait
  ✓ one record for the whole sheet 
  ✓ undo removes it in one step 
4. Merge & Centre with two values
  ✓ asks first, naming the value kept 
  ✓ one cell over the block, keeping A10 480 px
  ✓ undo brings the other value back 
5. Paste a formatted table from Excel
  ✓ bold, fill, alignment kept 
  ✓ currency and the Good fill kept EGP 12,500.00 rgb(198, 239, 206)
6. Copy formatted cells out
  ✓ HTML carries the styles for Excel and Google Sheets 
  ✓ shown text in HTML, the value in the text  Campaign Budget Ramadan teaser EGP 12,500.00 
7–8. Comments: mention, notification, reply, edit, delete, resolve, reopen
  ✓ a corner marker on the cell 
  ✓ axe: comment thread 
  ✓ SC-004: the mention is in the member’s notifications, naming the cell 
  ✓ one click opens the sheet at the cell with its thread 
  ✓ the member replies 
  ✓ everyone sees the reply 
  ✓ edit own comment, marked edited 
  ✓ an admin deletes a comment; it reads "Comment deleted" 
  ✓ resolve hides the marker 
  ✓ the panel lists it under Resolved 
  ✓ axe: comments panel 
  ✓ reopen brings the marker back 
9. Delete the commented, formatted row; undo
  ✓ the thread goes with the row markers 0, row 3: 
  ✓ undo brings the thread and the formatting back 
10–11. The Content sheet
  ✓ a task row filled amber 
  ✓ the status pill keeps its colour, the fill around it 
  ✓ saved by task id 
    (focus: DIV.fx-sheet-td is-title is-frozen-title is-active has-fill in panel=true )
  ✓ a comment on a task’s title 
  ✓ Merge is off and says why 
  ✓ the formatting and comment follow the task after a reload rgb(255, 192, 0), 1 marker
  ✓ axe: Content sheet with the toolbar 
12. A protected sheet, as another member
  ✓ formatting is off, with the reason in its tooltip 
  ✓ commenting is allowed 
13. Arabic and a 390 px phone
  ✓ right to left 
  ✓ numbers follow the language ‏١٢٬٥٠٠٫٠٠ EGP
  ✓ axe: Format Cells in Arabic 
  ✓ axe: toolbar in Arabic 
  ✓ phone: bottom-sheet formatting, 44 px targets 44×44
  ✓ phone: the thread opens full screen 
  ✓ axe: thread on a phone 
14. Accessibility
  ✓ axe: toolbar 
  ✓ axe: colour picker 
  ✓ axe: border picker 
  ✓ axe: Format Cells 
  ✓ no page errors 

52 passed, 0 failed
```

## Notes

- **SC-002.** Formatting the whole 5,000-row sheet (Ctrl+A, then a font) shows on screen in 257 ms and is one record and one undo step. The save lands after the outbox's usual 400 ms wait (spec 013 R6): 567 ms in total in the final run.
- **Ctrl+1.** Chrome keeps Ctrl+1 (Cmd+1 on a Mac) for switching to the first browser tab, so a page never receives it there. Format Cells opens from the toolbar button and from "More number formats…". The other shortcuts (Ctrl+B, I, U, 5; Ctrl+Shift+$ % # !; Ctrl+Alt+M) work.
- **Leaving before a save.** As in spec 013, leaving with changes still waiting asks first. The script waits for "Saved" before it moves on.
- **UI scenarios.** Formatting and comments are checked on the running app above, not in the component labs. The labs bundle the grids without a server, and the sheet lab confirms they still work with no formatting context (150/150).


---

# Validation: spec 015 stage 2 (editing tools)

Run on 2026-11-11 against a production build (`next build` + `next start`) and local PostgreSQL.

## Labs and server checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | builds |
| `npm run lab:spreadsheet` (adds `tools-find`, `tools-paste`, `view-batch`) | 21/21 |
| `scripts/spreadsheet-lab/smoke/run.ts` (adds `view` saves: hide, unhide, freeze clamps, protected refusal; `clearCellComments`) | all passed |
| `npm run lab:sheet` | 150/150 |
| `npm run lab:notify` | 46/46 |
| `scripts/spreadsheet-lab/realapp/run.cjs` (spec 013) | 56/56 |
| `scripts/spreadsheet-lab/realapp/perf-axe.cjs` (spec 013 speed and axe) | 18/18; arrow keys p95 34 ms on 5,000 rows with the new frozen-pane code |
| `scripts/spreadsheet-lab/realapp/format.cjs` (stage 1) | 52/52 |

## Running-app checks (US4)

`node scripts/spreadsheet-lab/realapp/editing.cjs`: **50 passed, 0 failed.**

```
1. Format Painter (FR-040)
  ✓ the painter is on and says so 
  ✓ the target takes the look 
  ✓ one use, then off 
  ✓ undo in one step 
  ✓ a double-click keeps it on 
  ✓ Esc stops it 
2. Paste Special (FR-041)
  ✓ axe: Paste Special 
  ✓ values only, transposed: no formatting 
  ✓ formats only: the look without the value 
  ✓ each one undoes in one step 
3. Fill Down and Right (FR-043)
  ✓ Ctrl+D copies the value and the look down 
  ✓ undo puts every cell back 
  ✓ Ctrl+R fills right 
4. Clear (FR-042)
  ✓ Clear formats keeps the value 
  ✓ Clear contents keeps the look 
  ✓ Clear comments removes the thread only 
5. Find and Replace (FR-044)
  ✓ axe: Find and Replace 
  ✓ finds 4 matches, any case 1 of 4 · A1
  ✓ steps to the next one, selecting it 
  ✓ match case: 3 
  ✓ whole cell: 1 
  ✓ Replace all: 4 cells, one step 
  ✓ undo puts all 4 back 
6. Hide and unhide (FR-047)
  ✓ the row is gone from view 
  ✓ the next row is still numbered 3 
  ✓ a marker shows where it is 
  ✓ column B hidden: C follows A 
  ✓ still hidden after a reload 
  ✓ the markers unhide them 
  ✓ undo hides it again 
7. Freeze Panes on 5,000 rows (FR-047)
  ✓ row 1 stays under the headings, far down the sheet 
  ✓ column A stays at the start while scrolling sideways 
  ✓ still frozen after a reload 
  ✓ Unfreeze 
8. The Content sheet (FR-075)
  ✓ Find steps through task titles 1 of 10 · Suez Canal Report · Title
  ✓ Replace all goes through each task’s own save; cells the member can’t edit are counted 0 replaced; 10 not changed (you can’t edit them)
  ✓ the member’s titles are as they were 
  ✓ an admin’s Replace all changes the titles 9 replaced; 1 not changed (you can’t edit them)
  ✓ undo puts every title back 
  ✓ Freeze and Hide are off here, and say why 
9. Arabic and a phone
  ✓ axe: Find and Replace in Arabic 
  ✓ axe: Clear menu in Arabic 
  ✓ phone: the Edit tab, 44 px targets 
  ✓ phone: Find fits the screen 
  ✓ axe: Find on a phone 
10. Accessibility
  ✓ axe: paste menu 
  ✓ axe: fmt menu 
  ✓ axe: fillDn menu 
  ✓ axe: freeze menu 
  ✓ no page errors 

50 passed, 0 failed
```

## Notes

- **Content and Video sheets.** Fill, Replace, Clear contents and Paste values go through each task's own save, as typing does. Cells the person can't edit are counted ("10 not changed (you can't edit them)") and nothing else changes. Hide and Freeze are off on these sheets, with the reason shown: their rows are the board's tasks, and the title column is already frozen.
- **Comments only** in Paste Special is shown disabled, with its reason: comments don't travel on the clipboard.
- **Clear Comments** removes your own comments; an admin's removes all. Others' comments are counted as skipped.
- **Format Painter** applies the look to the next drag or click, as in Excel. A double-click keeps it on until Esc.
- **Dev server timing.** On `next dev`, `run.cjs` (Ctrl+Z right after a linked paste) and `perf-axe.cjs` (arrow keys p95 211 ms) can fail because compiles are slow. Both pass on the production build above.
- **Lab data.** Section 8 renames real task titles as an admin and undoes them. The script checks that undo puts every title back, and a backup comparison found 0 differences afterwards.
