# Research: Sheet Formatting, Editing Tools and Comments

## R1. Where formatting lives: one table, layered like Excel

**Decision.**
- **One table, `sheet_formats(sheet_id, row_key, col_key, style)`**, holds formatting for every sheet. `row_key` and `col_key` are text:
  - **Blank sheets:** a row id and a column id (spec 013).
  - **Content and Video sheets:** a task id and a column key (`title`, `status`, `c:<uuid>` …).
  - **The empty string means "all":**
    - `('', colKey)` is a whole column;
    - `(rowKey, '')` is a whole row;
    - `('', '')` is the whole sheet.
- **A cell's look** is the sheet style, then the column style, then the row style, then the cell style. Each layer overrides only the properties it sets, as in Excel.
- **Formatting a whole column, a whole row or Ctrl+A** writes one record. Formatting cells that already have their own style updates each of those records.
- **Not foreign keys.** The keys aren't tied to the row and column tables, so:
  - deleting a blank row or column leaves its formats in place;
  - undoing that delete reuses the same ids (spec 013 R5), so the formatting comes back with the row;
  - on the Content and Video sheets, formatting follows the task by id through regrouping, dropping and restoring (FR-071).
- **Orphans are harmless and small.** A daily job may clear formats for rows, columns and tasks that are gone and older than 30 days.

**Why.**
- This meets SC-002 (10,000 cells in under a second) and keeps the change set small.
- One model serves both kinds of sheet.
- It's the way Excel itself stores row and column formats.

**Alternatives.**
- **A style column on `sheet_cells`:** it needs a row for every formatted empty cell, can't do column or row formats, and doesn't fit the Content and Video sheets.
- **A shared style table with ids:** less storage, but every change becomes a two-step write. JSON styles are small (about 100 bytes).

## R2. Values stay text; number formats only change what's shown

**Decision.**
- Cells keep the text people type (spec 013).
- `src/lib/sheet-format.ts`'s `display(text, numberFormat, locale)`:
  - reads the text as a number when it can (`12500`, `1,250.5`, `12.5%`, Arabic digits) or as a date (ISO, `16/11/2026`, `16 Nov 2026`);
  - formats it with `Intl.NumberFormat` and `Intl.DateTimeFormat`, or a custom date pattern (`dd/mm/yyyy`, `ddd d mmm`, `yyyy-mm-dd`);
  - shows text that can't be read as typed (FR-020–FR-023).
- **The editor and copy-out use the raw text.** Copying to Excel sends the shown text in the HTML and the raw value in the TSV, as Google Sheets does.

**Why.** There are no formulas, so there's nothing to compute. Keeping the typed text means a format can't damage the data.

## R3. The style object

**Decision.** `CellStyle` is a flat JSON object. Every field is optional:

```text
font?: string; size?: number                          # from FONTS; 6–72
b?, i?, s?: boolean; u?: 'single' | 'double'          # bold, italic, strikethrough, underline
color?, fill?: '#RRGGBB'
bt?, br?, bb?, bl?: { w: 'thin'|'medium'|'thick'|'dashed'|'dotted'|'double', c: '#RRGGBB' } | null
ha?: 'general'|'left'|'center'|'right'|'justify'; va?: 'top'|'middle'|'bottom'
wrap?: boolean; indent?: 0–15; rot?: -90…90 | 'vertical'
num?: { kind: 'general'|'number'|'currency'|'accounting'|'percent'|'scientific'|'date'|'time'|'text',
        dp?: 0–10, sep?: boolean, cur?: 'EGP'|'USD'|'EUR'|'GBP'|'SAR'|'AED', neg?: 'minus'|'paren'|'red'|'paren-red', pattern?: string }
```

- **The server validates every field** and drops anything unknown or out of range.
- **On screen:**
  - `toCss(style)` builds an inline style object, cached by a key built from the style's fields;
  - borders are drawn with inset box-shadows, so neighbouring cells don't double them;
  - fills and colours keep text readable: the cell picks white or ink text automatically only when "Automatic" text colour is set.
- **Fonts** (FR-010):
  - Inter, Montserrat, IBM Plex Sans Arabic and Caveat are already loaded;
  - Arial, Georgia, Times New Roman, Courier New, Verdana, Tahoma and Trebuchet MS are web-safe;
  - Calibri is shown as Calibri, with Carlito and Arial as fallbacks.
- **Palette:** Excel's 10 theme colours with 5 tints each, 10 standard colours, and "More colours" (the native picker).

## R4. Merges

**Decision.**
- **Storage:** `sheet_merges(sheet_id, id, top_row, left_col, bottom_row, right_col)`, by row and column ids, on blank sheets only.
- **Rendering:**
  - the anchor cell is drawn above the cells it covers, sized to the merged area, and grows across the column template and the row heights;
  - covered cells render empty and can't be focused;
  - selecting into a merge selects the whole merge.
- **Merging** keeps the top-left value. If other values exist, the merge is confirmed first. Undo restores the values.
- **Inserting** a row or column inside a merge widens it, because the merge is bounded by ids at its edges. **Deleting an edge** row or column shrinks it.
- **Sort and filter** are refused across merges, with a reason.

## R5. Comments

**Decision.**
- **Table:** `sheet_comments(id, sheet_id, row_key, col_key, root_id, author_id, body, mentions uuid[], created_at, edited_at, deleted_at, resolved_at, resolved_by)`.
  - A thread is its first comment (`root_id` is null) plus its replies.
  - Resolve is set on the root.
  - Keys work as in R1, so comments follow the row, the column or the task. Comments on a deleted row come back when the delete is undone.
- **Actions** (`src/actions/sheet-comments.ts`):
  - **create:** any member who can open the sheet, including on a protected sheet;
  - **edit:** the author only;
  - **delete:** the author or an admin; it's a soft delete, and a root with replies shows "Comment deleted";
  - **resolve and reopen:** any member.
- **Notifications** (spec 012):
  - New kinds: `sheet_mention` (each mentioned member) and `sheet_reply` (the thread's earlier participants, grouped per thread).
  - `task_id` stays null. `meta` carries `{ sheet_id, folder_id, sheet_name, cell, row_key, col_key, snippet }`.
  - The bell and the emails link to `/sheets/<folder>?sheet=<id>&cell=<row_key>:<col_key>`, which selects the cell and opens its thread.
  - Members can turn the new kinds off in Notification settings.
- **Freshness:**
  - The panel and markers load with the sheet.
  - Opening the panel or a thread re-fetches.
  - Spec 012's pulse (8 s) carries new-comment notifications.
  - There is no live co-editing, as in spec 013.

## R6. Saving, undo and the clipboard

**Decision.**
- **Saving** (`applySheetChanges` gains):
  - `formats: { rowKey, colKey, style | null, mode: 'set'|'merge' }[]`, where `merge` is applied server-side over the record's current style;
  - `merges: { add?: Merge[]; remove?: id[] }`;
  - `view: Partial<SheetView>`, for frozen rows and columns, hidden rows and columns, and the filter.
- **The Content and Video sheets** use a new `applyLinkedFormats(sheetId, formats, view)`, so they never touch task data.
- **Undo** gets new change kinds: `formats` (before and after per record), `merges` and `view`.
  - Format Painter, Clear Formats and Paste Special › Formats are each one step.
  - Comments aren't on the undo stack, as in Excel, except when a row or column delete is undone (R1, R5).
- **Clipboard:**
  - `parseHtmlTable` also reads Excel's `<style>` block (`.xl65 { … }`) and each cell's `class` and `style`, mapping `font-weight`, `font-style`, `text-decoration`, `color`, `background`, `text-align`, `vertical-align`, `border-*`, `white-space` and `mso-number-format` to `CellStyle` (SC-003).
  - `serialise` writes inline styles, so Excel and Google Sheets keep them.

## R7. Editing tools (stage 2)

**Decision.**
- **Format Painter:** UI state only. It applies the source's own style (cell layer) to the target as `set`.
- **Paste Special:** a dialog on Ctrl/Cmd+Shift+V. "Values only" writes cells, "Formats only" writes formats, and "Transpose" swaps rows and columns.
- **Fill Down and Fill Right:** write cells and formats. On the Content and Video sheets, values go through spec 013's per-cell saves, and skipped cells are counted.
- **Find & Replace:** search on the client over the loaded sheet. Replace goes through `writeCells` (spec 013), so permissions and undo stay the same.
- **Hide, unhide and freeze:**
  - blank sheets use `sheet_rows.hidden` and `sheet_cols.hidden`;
  - the Content and Video sheets keep hidden task rows and columns in `sheets.view` (spec 010 already hides columns per set; this adds rows);
  - frozen rows and columns are in `sheets.frozen_rows` and `sheets.frozen_cols`;
  - GridCore makes the first N rows and columns sticky (column 0 is already sticky in spec 008).

## R8. Sort, filter, styles, tables and conditional formatting (stage 3)

**Decision.**
- **Cell styles:** named presets in `sheet-format.ts` that apply as `merge`.
- **Tables:** `sheet_tables(sheet_id, id, top_row, left_col, bottom_row, right_col, style, header boolean, banded boolean)`.
  - Banding and the header are drawn at render, not stored per cell.
  - Filter buttons come from the table or from Filter (Ctrl/Cmd+Shift+L).
- **Sort:**
  - **Blank sheets:** the rows' `position` values are rewritten in one change, so it's undoable.
  - **The Content and Video sheets:** a sort setting in `sheets.view`, applied within each group, and never to the board.
- **Filter:**
  - A shared setting in `sheets.view` (`{ colKey: { values?, color?, condition? } }`), as in Excel's file-level filter.
  - Hidden rows are computed at render, and the grid shows filtered heading buttons.
- **Conditional formatting:**
  - `sheet_rules(sheet_id, id, range, kind, args, style, priority)`.
  - `sheet-rules.ts` evaluates the rules for the visible rows, in order; the first match wins per property, as Excel's "stop if true".
  - Kinds: highlight rules, top/bottom, duplicates, data bars and 3-colour scales.

## R9. Toolbar and phones

**Decision.**
- **Desktop:** one row under the workbook toolbar, grouped like Excel's Home tab (Clipboard · Font · Alignment · Number · Styles · Cells · Editing). Groups that don't fit fold into "More ▾".
- **Phones:** a "Format" button opens a bottom sheet with tabs (Text · Fill · Borders · Align · Number).
- **Format Cells…** (Ctrl/Cmd+1) has every option in one dialog: Number, Alignment, Font, Border, Fill.
- **The toolbar's state** reflects the active cell's resolved style.
- **On the Content and Video sheets**, the toolbar appears too, and Merge is disabled with its reason (FR-074).

## R10. Delivery in three stages

Each stage gets its own tasks, lab scenarios, running-app checks and PR:

1. **Stage 1 (US1–US3):**
   - `sheet_formats`, `sheet_merges` and `sheet_comments`;
   - the toolbar with Font, Fill, Borders, Alignment, Merge and Number;
   - Format Cells;
   - the comments panel, threads and markers;
   - the new notifications;
   - clipboard styles;
   - the Content and Video sheet rules.
2. **Stage 2 (US4):** Format Painter, Paste Special, Clear, Fill, Find & Replace, hide and unhide, Freeze Panes.
3. **Stage 3 (US5):** cell styles, Format as Table, sort, filter, conditional formatting.
