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
