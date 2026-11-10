# UI Contract: Sheet Formatting, Editing Tools and Comments

The look follows `design/sheet-formatting.html`, approved before any UI (§IV).

## 1. Format toolbar (`data-format-bar`)

One row under the workbook toolbar, in Excel's Home-tab order.

| Group | Controls (stage) |
|---|---|
| Clipboard | Paste ▾ with Paste Special (2) · Format Painter (2) |
| Font | font ▾ · size ▾ · B I U S · text colour ▾ · fill ▾ · borders ▾ (1) |
| Alignment | left, centre, right · top, middle, bottom · wrap · indent − + · rotate ▾ · Merge ▾ (1) |
| Number | format ▾ · currency ▾ · % · thousands · .0← · →.00 (1) |
| Styles | Cell Styles ▾ · Format as Table ▾ · Conditional Formatting ▾ (3) |
| Cells | Format ▾: row height, column width, hide, unhide (2) |
| Editing | Clear ▾ (2) · Fill ▾ (2) · Sort & Filter ▾ (3) · Find & Select ▾ (2) · Freeze ▾ (2) |

- Each control has a `data-fmt="<name>"` attribute, a label, a tooltip with its shortcut, and `aria-pressed` for toggles.
- The toolbar shows the active cell's resolved style.
- On the Content and Video sheets, Merge is disabled with its reason.
- On phones, a **Format** button opens a bottom sheet with tabs.

## 2. Pickers and dialogs

- **Colour picker** (`data-color-picker`):
  - Automatic or No fill;
  - 10 theme columns × 6 shades;
  - 10 standard colours;
  - recent colours;
  - More colours.
- **Borders** (`data-border-picker`): 13 presets, plus line style and line colour.
- **Format Cells** (Ctrl/Cmd+1, `data-format-dialog`): Number, Alignment, Font, Border and Fill tabs, with a live preview.
- **Find & Replace** (Ctrl/Cmd+F and Ctrl/Cmd+H), **Paste Special**, **Sort**, **New rule** and **Manage rules**: modal dialogs, labelled, Esc to cancel.

## 3. The grid

- **Cell styles:** cells render their resolved style; borders are drawn with inset shadows.
- **Merges:** a merged cell is drawn over the cells it covers.
- **Frozen panes:** frozen rows and columns stay put, with a thicker edge line.
- **Hidden rows and columns:** a double line on the heading where they are; a click on it unhides them.
- **Filters:** a ▾ in filtered headings, highlighted while a filter is on.
- **Comment markers:** a purple corner triangle (`data-comment-marker`) on cells with open threads. Hovering shows the thread, and selecting a cell with a thread shows it on its side.

## 4. Comments

- **Thread popover** (`data-comment-thread`):
  - the comments, then the reply box;
  - @mention picker (spec 012);
  - ⋯ on own comments: Edit, Delete;
  - Resolve (✓);
  - Ctrl/Cmd+Enter to send.
- **Comments panel** (`data-comments-panel`): opened with the 💬 button on the workbook toolbar.
  - Tabs: Open and Resolved.
  - Each thread shows its cell's name (B4, or the task and column on the Content and Video sheets).
  - A click jumps to the cell.
- **New comment:** the cell's right-click menu, Ctrl/Cmd+Alt+M, or the toolbar.

## 5. Phones and Arabic

- **Phones:**
  - formatting is in the bottom-sheet tabs;
  - threads open full-screen;
  - targets are 44 px.
- **Arabic:**
  - alignment mirrors;
  - number and date formats follow the locale;
  - Arabic digits are read when typed.
