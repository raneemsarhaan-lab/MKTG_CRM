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
