# UI Contract: Spreadsheet Editing and Sheet Tabs

The look follows `design/sheets.html`, the full design. It is made before any UI work (§IV) and builds on `design/sheets-options.html`, option C. New strings go in a `sheets` namespace in `messages/en.json` and `messages/ar.json`. Colours are `--sheet-*` (existing) and new `--sh-*` variables only.

## 1. Navigation

- **Sidebar** (`src/lib/nav.tsx`, `Sidebar`, `NavRail`): a **Sheets** item after Board (`href: '/sheets'`). Under it, the member's pinned folders (`data-pinned-folder`), each with its ⋯ menu (Unpin, Rename, Delete for team folders).
- **Phone bar** (`TabBar`): Sheets takes the third place, and Team moves into More (R13).

## 2. Sheets home (`src/components/sheets/SheetsHome.tsx`, `data-sheets-home`)

- **Head:** "Sheets" and **New folder** (`data-new-folder`). New folder asks for a name inline, then opens the folder.
- **Linked to the board:** the Content and Video cards.
- **Team folders:** cards sorted by name, then a dashed "New folder" card.
- **A card** (`data-folder="<id>"`) shows the name, the sheet count, "Edited <time> by <name>", and 🔗 for linked folders. Its ⋯ menu offers Pin / Unpin, plus Rename and Delete for team folders.
- **Delete** shows "Folder deleted · Undo" for 10 s (`data-folder-undo`).

## 3. Workbook (`src/components/sheets/Workbook.tsx`, `data-workbook`)

- **Top:** a breadcrumb "Sheets › <folder>" (`data-crumb`), with 🔗 Linked on linked folders. Then the save status (`data-save-status`: `saving` · `saved` · `retrying`), read aloud politely.
- **Toolbar:** Undo (`data-undo`) and Redo (`data-redo`), disabled when there's nothing to do, then the selection summary ("12 cells selected").
- **The open sheet:**
  - a blank sheet is `BlankSheet` over `GridCore`;
  - the linked tab is `KanbanBoard` with `surface="sheets"` (R2).
- **The tab bar** (§5).

## 4. The grid (`GridCore`, shared)

**Selection**
- `data-sel-anchor`, `data-sel-focus`;
- selected cells carry `.is-selected`, and the active one `.is-active`;
- a 2 px purple frame around the range.

**Mouse**
- click selects, Shift+click extends, drag selects;
- a click on a row number or heading selects the row or column;
- double-click edits with the caret at the point;
- right-click opens the cell, row or column menu.

**Keyboard** (FR-003, FR-004)

| Keys | What they do |
|---|---|
| Arrows | Move one cell |
| Shift+arrows | Extend the selection |
| Ctrl/Cmd+arrows | Jump to the edge of the data |
| Home / End | First or last cell in the row |
| Page Up / Page Down | One screen |
| Ctrl/Cmd+A | Select all |
| Enter / F2 | Edit |
| Typing | Replace the cell |
| Alt+Enter | Line break while editing |
| Enter / Shift+Enter, Tab / Shift+Tab | Commit and move |
| Esc | Cancel |
| Delete / Backspace | Clear the selection |
| Ctrl/Cmd+C / X / V | Copy, cut, paste |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y | Undo, redo |
| Shift+F10 or menu key | The menu |

**Menus**
- **Cell menu:** Cut, Copy, Paste, Clear, Insert row above or below, Insert column left or right, Delete row, Delete column.
- **Row-number menu:** Insert 1 above, Insert 1 below, Delete rows, Resize row.
- **Heading menu:**
  - on blank sheets: Insert 1 left, Insert 1 right, Delete columns, Resize column;
  - on linked sheets: spec 010's column menu, plus Insert column.
- **Disabled items** say why ("Pipeline columns can't be deleted").

**Resizing**
- columns: the heading's edge (`data-col-resize`, spec 010);
- rows: the row number's bottom edge (`data-row-resize`), with a double-click to reset.

**Messages**
- after a paste, clear or cut with skips, a note under the toolbar: "3 cells weren't changed: you can't edit 2 tasks, 1 is archived" (`data-skip-note`);
- refusals show the existing cell note.

**Size and access**
- windowed rows (R7), with `aria-rowcount` and `aria-rowindex` kept true;
- the active cell is announced with its range size ("B3, 12 cells selected").

## 5. Tab bar (`src/components/sheets/TabBar.tsx`, `data-sheet-tabs`, `role="tablist"`)

**Order, as in Excel**
1. scroll arrows (`data-tabs-scroll="start|end"`), shown only when the tabs overflow;
2. "+" (`data-new-sheet`);
3. ≡ (`data-all-sheets`);
4. the tabs.

**A tab** (`data-sheet-tab="<id>"`, `role="tab"`)
- its name;
- 🔗 for linked, 🔒 for protected;
- a bottom stripe in its colour;
- `aria-selected` for the open one: raised, white, with a purple top edge;
- `.is-grouped` for grouped tabs.

**Mouse**
- click opens;
- double-click renames (an inline input, `data-tab-rename`);
- drag reorders (`data-tab-drop` marks where it lands);
- Ctrl/Option+drag copies;
- right-click, or the ▾ that appears on hover and focus, opens the menu.

**Keyboard**
- ←/→ (mirrored in Arabic), Home and End move between tabs;
- Enter opens;
- F2 renames;
- Shift+F10 opens the menu;
- Ctrl+Page Up/Down switches from inside the grid;
- Shift+F11 adds a sheet.

**The menu** (`data-tab-menu`, Excel's order)
1. Insert;
2. Delete;
3. Rename;
4. Move or Copy…;
5. Protect Sheet… / Unprotect Sheet;
6. Tab Color ▸ (a swatch row with No Color, `data-tab-color="<key>"`);
7. a separator;
8. Hide;
9. Unhide…;
10. a separator;
11. Select All Sheets.

Disabled items carry a reason, read aloud.

**Dialogs**
- **Move or Copy** (`data-move-copy`, `role="dialog"`):
  - "To folder" (a select);
  - "Before sheet" (a list ending in "(move to end)");
  - ☐ Create a copy;
  - Cancel and OK.
- **Unhide** (`data-unhide`): a list of the hidden sheets, then OK.
- **Delete:** a confirmation naming the sheet, or the number of sheets.
- **Protect:** a confirmation explaining who can still edit.

## 6. States

- **Loading a sheet:** a skeleton grid with the tab bar live.
- **A refused tab action:** a toast with the reason. The tab state rolls back.
- **Someone else deleted the open sheet:** "This sheet was deleted. Copy what you see into a new sheet?" with Copy and Close.
- **Offline:** the status shows "Not saved, retrying (N)", editing continues, and leaving asks first.

## 7. Phones and Arabic

As research R13:
- tap, double-tap and long-press;
- "Select range" in the cell menu;
- the tab bar above the bottom navigation, with 44 px targets;
- the panel and dialogs full-screen;
- every surface mirrors in Arabic, with letter headings kept as A, B, C.
