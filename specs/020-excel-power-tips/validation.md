# Validation: Excel Power Tips

## Stage A (US1–US3)

Run against `next start` with the local database (see `quickstart.md`).

| Check | Command | Result |
|---|---|---|
| Pure checks (series, dates, Flash Fill, Go To Special folding, validation) | `npm run lab:spreadsheet` | 33/33 |
| Stage A on the running app | `node scripts/spreadsheet-lab/realapp/tips-a.cjs` | 73/73 |

**What `tips-a.cjs` covers (quickstart Stage A):**

- **§1:** Shift/Ctrl+Space; F5 → Go To → Special… → Blanks; "TBD" + Ctrl+Enter and its one undo step; Ctrl+G.
- **§2:** F4 and Ctrl+Y repeat an insert.
- **§3:**
  - The fill handle: its tip, 5, 10 → 15–30, and Auto Fill Options replacing the fill as one undo step.
  - Jan → May, Arabic month names, and Fill Weekdays skipping Friday and Saturday.
  - Double-click to the data's end, drag back to clear, Shift+drag to insert rows.
  - The right-drag menu (greyed items, Growth Trend), and a custom list saved by an admin and continued.
- **§4:** Ctrl+;, a leading apostrophe, Ctrl+E first names (with the status bar count and Flash Fill Options), and a refused example.
- **§5:**
  - The Data Validation dialog, ▾ with the input message, picking a value, and the Stop alert with Cancel.
  - A value typed in another case is spelled as in the list. A paste keeps only allowed values and counts the refused one.
  - An insert inside the range grows it, and Alt+↓ shows the column's values.
- **§6:** Ctrl+wheel zoom kept after a reload, Ctrl+0, Shift+wheel, Ctrl+F1, KeyTips (Alt, A), and the status bar's Average, Count and Sum.
- **§7:** The Content sheet:
  - the fill handle, Alt+↓, and zoom from the status bar;
  - Ctrl+G by row number;
  - Go To Special (the choices that fit; Data validation greyed);
  - Constants with the status bar's Count;
  - F4 repeating Bold, with both undone;
  - Ctrl+E's note.
- **§8:** Arabic (the handle on the left corner), a phone (status bar without the slider), axe on every dialog and menu, and no page errors.

**Regressions:** fields, content-fields, video-fields, links, areas, header, run, editing, format, styles, perf-axe, and `npm run lab:sheet`. Results are recorded in the stage A PR.

**Notes:**

- Shift+Space moves the active cell to the row's first cell. Ctrl+Space moves it to the column's first cell. The grid's selection always starts at the active cell, so it can't stay where it was as it does in Excel.
- The design's Page Layout and Page Break view buttons are left out of the status bar until printing arrives (stage C), so nothing is shown that does nothing.
- **On the Content and Video sheets:**
  - They have everything but Data Validation, which they don't need: their values are already the board's choices.
  - Go To there takes a row number as shown on the left.
  - Go To Special offers Notes, Constants, Blanks (empty cells you can type into), Current region, Last cell, Visible cells only, and Row and Column differences.
  - F4 repeats the last formatting, Clear or Fill Down / Right.

## Stage B (US4–US6)

Run against `next start` with the local database (see `quickstart.md`).

| Check | Command | Result |
|---|---|---|
| Pure checks (custom formats, cleanup, criteria, wildcards, outline, icon sets) | `npm run lab:spreadsheet` | 39/39 |
| Stage B on the running app | `node scripts/spreadsheet-lab/realapp/tips-b.cjs` | 58/58 |

**What `tips-b.cjs` covers (quickstart Stage B):**

- **§1 Formats:**
  - Ctrl+Shift+1, and `#,##0.0,,"M"` showing 1.3M while the cell keeps 1250000.
  - `;;;` hiding a value, and a code it can't read (`[Red]0`) refused with its reason.
  - Center Across over A11:F11 with no merge.
  - A whole-row rule (Spend > 1,000), 3 Arrows on the Spend column, and AutoFit Column Width from the menu.
- **§2 Cleanup:**
  - Remove Duplicates on 300 pasted rows says "12 duplicate rows found and removed; 288 unique rows remain." (about 0.9 s; SC-002), and Undo in the note brings them back.
  - Trim Spaces and Clean (300 cells changed) and Proper Case, each one undo step.
  - The green corner and Convert to Number, and Convert Text to Numbers.
  - Text to Columns by comma, with "There's already data here. Replace it?".
  - Find `~*` and `Q? plan`.
  - Paste Special › Multiply by 1000, with the cell that isn't a number counted.
- **§3 Tables:**
  - Ctrl+T offering `=$A$1:$E$6`, then the Total row with Sum from its ▾.
  - A slicer click (Meta) that the total follows, and Clear Filter.
  - The Advanced Filter in place (Meta over 1,000, or Google), then copied with Unique records only to a new sheet.
  - Rows grouped with Shift+Alt+→, collapsed with −, still collapsed after a reload, expanded with +, and ungrouped with Shift+Alt+←.
- **§4 Status bar:** Average, Count and Sum, then Minimum and Maximum switched on from Customize Status Bar and kept after a reload.
- **The Content sheet:** Clean up is greyed there with the reason, and Find takes wildcards.
- **Also:** Arabic, axe on every dialog and menu, and no page errors.

**Notes:**

- **Advanced Filter** reads Excel's criteria range, as in the approved design, instead of the plan's AND/OR builder. Plain text in a criteria cell matches values that begin with it, as in Excel; `=Meta` matches exactly.
- **Remove Duplicates** works on the selection, the table or the block around the cell. It closes the range up and doesn't delete whole sheet rows, so data beside the range stays where it is (as Excel does).
- **Paste Special › Comments** stays greyed, with its reason. Comments are threads with replies and notifications, and copying them is left for later. Validation and Column widths come from cells copied on the same sheet.
- **The Total row** is a real row of the table, as in Excel. Its first cell holds "Total"; its totals are worked out from the visible rows, never stored.
- **Ctrl+T** may be kept by some browsers (it opens a tab there); Ctrl+L does the same thing in the sheet, and Data › Table › Create Table… is always there.
- **Groups:** rows show a bar beside the numbers with level buttons in the corner. Column groups show a line above the letters and − / + on the column after them; the level buttons are for rows.
- **Fix found by the lab:** a selected cell with a fill (a table's header) lost its fill under the selection tint, leaving white text unreadable. The tint now goes over the fill.
