# Quickstart: validating Excel Power Tips

## Prerequisites

- Local PostgreSQL. Start it with `service postgresql start` if needed.
- `DATABASE_URL=postgresql://momentum:momentum@localhost:5432/momentum`, then `bash scripts/migrate.sh` after each stage's schema change.
- `npm run build`, then `next start -p 3000` with a `NEXTAUTH_SECRET`.
- The lab members use the password `lab-pass-1`.

## Stage A (US1–US3): `node scripts/spreadsheet-lab/realapp/tips-a.cjs`

The lab seeds a team folder with a 200-row sheet with gaps, then checks:

1. **Rows, columns, blanks:**
   - Shift+Space and Ctrl+Space select the row and the column.
   - F5 → Special → Blanks selects only the empty cells of the used range.
   - "TBD" + Ctrl+Enter fills them, as one undo step.
2. **Repeat:** insert a row, move, press F4. A row is inserted there too.
3. **Fill handle:**
   - 5, 10 dragged down 4 rows gives 15–30.
   - "Jan" dragged gives Feb–May; Arabic month names continue in Arabic.
   - A date + Fill weekdays skips Friday and Saturday.
   - Double-clicking the handle fills to the data's end.
   - Dragging back clears, and Shift+drag inserts.
   - An admin's custom list continues.
4. **Quick entry:**
   - Ctrl+; enters today's date.
   - Ctrl+E fills first names from full names, and refuses an inconsistent example.
5. **Validation:**
   - A list on C2:C50 shows chips.
   - Typing an outside value is refused with a note; pasting counts it.
   - Inserting rows inside the range grows it.
   - Alt+Down lists the column's values.
6. **Zoom and the toolbar:**
   - Ctrl+wheel zooms and is kept after a reload; Ctrl+0 resets.
   - Shift+wheel scrolls sideways.
   - Ctrl+F1 collapses the strip.
7. **Content and Video sheets:**
   - Fill a stage word down three clip rows; each clip moves through the board's rules and one undo reverts all three.
   - Alt+Down on a team column works.
8. **Shared checks:** Arabic, a phone (menu paths only), axe, and no page errors.

## Stage B (US4–US6): `tips-b.cjs`

1. **Formats:**
   - Ctrl+Shift+1 gives Number.
   - `#,##0.0,,"M"` shows 1.3M for 1,250,000, with the stored value unchanged.
   - `;;;` hides a value.
   - Center across A1:F1 leaves no merge, and sort still works.
   - Whole-row highlight where D > 1000.
   - Icon sets.
2. **Cleanup:**
   - 300 pasted rows: Remove duplicates (count first), Trim, Proper case, Text→Number and Split by comma.
   - Each says how many cells changed and undoes in one step (SC-002 timing logged).
   - Find `~*` finds a literal asterisk.
   - Paste Special Multiply ×1000.
3. **Tables:**
   - Ctrl+T, then a Total row whose Sum follows the filter.
   - A slicer filters with a click.
   - Advanced filter OR + unique, copied to a new sheet.
   - Group rows (Shift+Alt+→) collapses and expands, and is kept after a reload.
4. **Status bar:** Sum, Average and Count of the selection; Min and Max switched on and kept.

## Stage C (US7–US8): `tips-c.cjs`

1. **Moves:**
   - Drag B2:C5's border to E2: it moves, formats and comments follow, one undo.
   - Ctrl copies, Shift inserts, Ctrl+Shift inserts a copy.
   - Right-drag gives Copy values only.
   - Alt+drag onto another tab moves the block there.
   - A move that splits a merge is refused.
2. **Locks:**
   - Unlock B2:B20, then protect.
   - A member types in B2 (saved) and in A2 (refused); the server refuses a forged change too.
3. **Print:** the print view of a 120-row sheet repeats the header row on each page and fits one page wide.

## Regressions (every stage)

- realapp: fields, content-fields, video-fields, links, areas, header, run, editing, format, styles, perf-axe.
- `npm run lab:sheet` and `npm run lab:spreadsheet`.
