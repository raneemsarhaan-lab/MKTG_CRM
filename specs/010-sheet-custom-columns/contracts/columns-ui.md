# UI contract: shaping sheet columns

These rules apply to both the Content sheet and the Video sheet. Strings live in `sheet.columns.*`, shared by both.

## 1. Header cell

- **Name:** the column's current name, ellipsised at its width, with the full name in a `title`.
- **▾ button** (`data-col-menu="{key}"`): shown on hover and focus. It opens the header menu (§3). `Alt+↓` from any cell in the column opens it too.
- **Dragging:** headings other than Title are `draggable`.
  - While dragging, a 2 px `--sheet-focus` bar marks the drop point.
  - Dropping calls `moveColumn(key, beforeKey)`.
  - Optimistic: the column moves at once, and goes back if refused.
- **Resizing:** a 6 px handle sits on the inline-end edge.
  - Dragging resizes live, clamped to 60–600.
  - On release it calls `resizeColumn`.
  - A double-click fits the column to its widest rendered cell.

## 2. Toolbar

Each sheet's toolbar gains **Columns** (`data-columns-button`) and **+ Column** (`data-add-column`).

## 3. Header menu (and each row's ⋯ in the Columns panel)

| Item | Shown when |
|---|---|
| Rename… | always |
| Reset name | built-in with a custom name |
| Insert column before… / after… | always (not "before" on Title) |
| Move left / Move right | not Title; not at the ends |
| Hide | not Title |
| Edit column… | custom |
| Delete column… | custom |

## 4. Columns panel (`data-columns-panel`, popover)

- **Row content:** one row per column in order, each with:
  - a checkbox for shown in this set (`data-col-shown="{key}"`; disabled for Title);
  - the name;
  - `aria-describedby` text and a tooltip reading "Changed by {name}, {when}" (FR-004).
- **Row ⋯ menu:** the §3 items, with Move up / Move down in place of left and right.
- **Footer:** + Column.
- **Keyboard:** Esc closes the panel and returns focus to the Columns button.

## 5. Column editor (`data-column-editor`, popover)

| Field | Details |
|---|---|
| Name | text field |
| Kind | radio group of seven kinds, each with an icon and a one-line description |
| Choice options | a list of rows: name field, colour swatch (cycles through `CHOICE_COLORS`), up, down, remove; then + Option |

On Save:
- **Errors:** shown inline (name taken, empty).
- **Kind change:** a review list shows the values that won't fit ("3 values will be cleared: …"). Confirm, then save.
- **Removing an option in use:** asks for a replacement: another option, or Clear.

## 6. Custom cells (`data-cell="{row}|c:{id}"`)

| Kind | Shows | Edit |
|---|---|---|
| Text | text, ellipsised | type, F2, Enter, double-click |
| Number | right-aligned, Western digits | as Text; refuses non-numbers |
| Date | "3 Nov 2026" | as Text; accepts YYYY-MM-DD or DD/MM/YYYY |
| Link | the site's name, as a link | `LinkPrompt`; refuses non-links |
| Person | `PersonChip` | the person menu |
| Choice | a filled pill in the option's colour | a menu of the pills, plus Clear |
| Checkbox | ☐ / ☑ (`role="checkbox"` semantics via `aria-checked` on the cell) | Space, Enter or click toggles |

- **Delete:** clears the value.
- **Refused value:** keeps the old value and shows the cell's note ("Not a number", "Not a link", "Not a date").
- **Read-only:** on rows the member may not edit, and on archived or dropped rows.

## 7. Delete confirmation and Undo

- **Confirmation:** "Delete Hook? 12 rows have a value. This removes the column and its values for everyone." Buttons: Delete / Cancel.
- **After delete:** a toast reads "Hook deleted · Undo" for 10 s.

## 8. Paste previews

- **Matching:** pasted columns that match current names fill their columns.
- **Bad values:** listed in Problems with the column's name.
- **Unknown headings:** listed under **Not imported**, each with **Add as a column**.
