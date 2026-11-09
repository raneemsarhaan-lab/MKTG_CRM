# Feature Specification: Spreadsheet Editing and Sheet Tabs

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "For the sheet: build a sheet mechanism exactly as Google Sheets. Make the existing sheets freely editable, with a familiar editing experience like Google Sheets. Focus on editing and sheet management. Do not add formulas or calculation functions. I need to be able to: click any cell and type or edit its content; double-click a cell to edit text within it; copy, cut, and paste individual cells or multiple cells, including tables copied from Excel or Google Sheets; select multiple cells by dragging; navigate using arrow keys, Enter, and Tab; add or delete rows and columns; resize rows and columns by dragging their boundaries; clear selected cell contents using Delete or Backspace; undo and redo edits. Sheet tabs: display sheet tabs at the bottom, like Google Sheets; include a '+' button to create a new blank sheet; switch between sheets by clicking their tabs; allow renaming, duplicating, deleting, and reordering sheets; give new sheets unique default names, such as 'Sheet 1' and 'Sheet 2'; keep each sheet's content and formatting independent; clearly highlight the active tab and prevent deleting the last remaining sheet. Remove any read-only restrictions that prevent normal editing. Preserve the current sheet design, content, and existing functionality. Automatically save edits, new sheets, tab names, and tab order. Restore everything when the page reloads. Implement this directly in the existing project and verify that editing, pasting, keyboard navigation, sheet creation, tab switching, and saving work correctly."

## Context

Momentum has two sheets today, both reached from the Board header:
- **The Video sheet** (spec 008): one row per video and per clip.
- **The Content sheet** (spec 009): themes, pillars and one row per piece.

Both are **linked sheets**: every row is a real task, so a change in the sheet is a change on the board, and the reverse. Spec 010 already lets the team add, rename, reorder, hide and resize columns.

Editing them today is a cell at a time:
- **Already there:**
  - click a cell, then type, or press Enter or F2, to edit it;
  - arrows, Enter and Tab move;
  - Esc cancels;
  - menu cells (status, editor) open a list;
  - pasting a list of clips or a content plan adds new rows through a preview.
- **Missing, compared with Google Sheets:**
  - double-click to edit inside the text;
  - selecting a block of cells by dragging or with Shift;
  - copy and cut;
  - pasting a block into existing cells;
  - Delete or Backspace clearing a selection;
  - undo and redo;
  - adding or deleting a row anywhere;
  - row heights;
  - more than one sheet, with tabs.

This feature brings both: the familiar editing of Google Sheets, on the existing sheets and on new blank sheets, and a tab bar at the bottom to create and manage sheets.

**Two kinds of sheet**, used throughout this spec:
- **Linked sheet:** the Video sheet and the Content sheet. Rows are tasks; some cells are pipeline fields with rules of their own (a stage, a person, a link).
- **Blank sheet:** a new sheet created with "+". A plain grid of text cells with letter columns (A, B, C…) and numbered rows, like a new Google Sheet. No link to tasks.

**Out of scope:** formulas and calculations, cell styling (bold, colours, borders), merged cells, charts, filters, and live co-editing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit cells the way I do in Google Sheets (Priority: P1)

A member opens a sheet and works straight in the grid:
- They click a cell and start typing, which replaces its content.
- They double-click a cell to put the cursor inside its text.
- They move with the arrow keys, Enter and Tab.
- They clear cells with Delete or Backspace.

**Why this priority**: Editing in place is the core of the request, and everything else builds on it.

**Independent Test**: In a blank sheet and in the Content sheet, type into a cell, edit inside another with a double-click, move with the keys, and clear a cell. Every change shows at once and is still there after a reload.

**Acceptance Scenarios**:

1. **Given** a cell is selected, **When** the member types a character, **Then** editing starts with the cell's content replaced by what is typed.
2. **Given** a cell holds "Hook draft", **When** the member double-clicks it, **Then** editing starts with the cursor at the clicked point and the existing text kept.
3. **Given** a cell is being edited, **When** the member presses Enter, **Then** the value is kept and the selection moves one cell down; Tab moves one cell right, and Shift+Enter and Shift+Tab move up and left.
4. **Given** a cell is being edited, **When** the member presses Esc, **Then** the edit is abandoned and the cell shows its previous value.
5. **Given** a cell is selected (not editing), **When** the member presses an arrow key, **Then** the selection moves one cell in that direction, mirrored in Arabic.
6. **Given** a cell is selected, **When** the member presses Delete or Backspace, **Then** the cell is emptied.
7. **Given** a cell is being edited, **When** the member presses an arrow key, **Then** the cursor moves within the text, not to another cell.

---

### User Story 2 - Select blocks, and copy, cut and paste them (Priority: P1)

A member selects a block of cells and copies, cuts or pastes it:
- they select by dragging, by Shift with a click or the arrows, by clicking a row number or column heading, or with Select all;
- they copy or cut the block and paste it elsewhere in Momentum;
- they paste tables copied from Excel or Google Sheets.

**Why this priority**: Moving content in and out of other spreadsheets is the main reason the team wants this.

**Independent Test**: Copy a 5 × 3 table from Google Sheets and paste it into a blank sheet: the 15 values land in the right cells. Copy a block from Momentum and paste it into Google Sheets: the same block arrives there.

**Acceptance Scenarios**:

1. **Given** a sheet, **When** the member presses on a cell and drags to another, **Then** the rectangle between them is selected and highlighted, with the starting cell marked as active.
2. **Given** a cell is selected, **When** the member Shift+clicks another cell or uses Shift+arrows, **Then** the selection extends to it.
3. **Given** a row number or a column heading, **When** the member clicks it, **Then** the whole row or column is selected; Ctrl/Cmd+A selects the whole sheet.
4. **Given** a selected block, **When** the member copies, **Then** the block can be pasted into Excel, Google Sheets or a text editor as rows and columns.
5. **Given** a table copied from Excel or Google Sheets, **When** the member pastes it with one cell selected, **Then** the values fill the cells starting there, row by row and column by column; a blank sheet grows to fit.
6. **Given** a single copied value and a selected block, **When** the member pastes, **Then** the value fills every cell of the block.
7. **Given** a selected block, **When** the member cuts and then pastes elsewhere, **Then** the values appear at the new place and the original cells are emptied.
8. **Given** a selected block, **When** the member presses Delete or Backspace, **Then** every cell in it is emptied in one step, undone in one step.

---

### User Story 3 - Sheet tabs at the bottom (Priority: P1)

A member manages sheets from a tab bar at the bottom, as in Google Sheets:
- "+" creates a blank sheet with the next free name;
- clicking a tab switches to it;
- each tab's menu offers Rename, Duplicate and Delete;
- tabs can be dragged into a new order.

**Why this priority**: Without tabs there is no way to make a new sheet, and the request names each of these actions.

**Independent Test**: Press "+" twice: "Sheet 1" and "Sheet 2" appear (or the next free numbers) and the second is open. Rename one, duplicate it, drag it first, then delete the copy. Reload: the tabs, names and order are as left. Try to delete the only remaining sheet: it can't be done.

**Acceptance Scenarios**:

1. **Given** the sheets area, **When** it opens, **Then** a tab bar along the bottom shows every sheet in its saved order, with the open one clearly highlighted.
2. **Given** the tab bar, **When** the member presses "+", **Then** a new blank sheet is created, named "Sheet N" with the lowest N not already used, placed last and opened.
3. **Given** two tabs, **When** the member clicks the other tab, **Then** that sheet opens with its own content, column widths, row heights and scroll position; the first sheet's are unchanged.
4. **Given** a tab, **When** the member double-clicks it or chooses Rename, **Then** they can type a new name; Enter saves it and Esc cancels. An empty name or a name already used by another tab is refused with a message.
5. **Given** a blank sheet's tab, **When** the member chooses Duplicate, **Then** a copy named "Copy of <name>" (numbered if needed) appears right after it with the same content and sizes, and later edits to either don't touch the other.
6. **Given** several tabs, **When** the member drags a tab to a new place, **Then** the order changes and is kept after a reload. Keyboard users can move a tab left or right from its menu.
7. **Given** a blank sheet's tab, **When** the member chooses Delete and confirms, **Then** the sheet and its content are removed, and the tab next to it opens.
8. **Given** only one sheet remains, **When** the member opens its menu, **Then** Delete is unavailable and explains why.
9. **Given** more tabs than fit, **When** the bar overflows, **Then** it scrolls sideways and a list of all sheets lets the member jump to any of them.

---

### User Story 4 - Everything saves itself and comes back (Priority: P1)

A member edits, pastes, creates and arranges sheets and never presses Save:
- every change is stored on its own: cell edits, new sheets, tab names and tab order;
- a reload, or another device, shows everything as it was left.

**Why this priority**: Work that's lost on reload makes every other story worthless.

**Independent Test**: Make one change of each kind, wait for "Saved", then reload. Everything is as it was, on this device and on another.

**Acceptance Scenarios**:

1. **Given** any change, **When** it is made, **Then** it is saved without any action, and a quiet status shows "Saving…" and then "Saved".
2. **Given** saved changes, **When** the page is reloaded, **Then** the same sheets, tab names, tab order, cell contents, column widths and row heights appear, and the sheet that was open is open again.
3. **Given** the connection drops, **When** the member keeps editing, **Then** the status says the changes aren't saved yet, the changes stay on screen, and they are saved once the connection returns. Leaving the page with unsaved changes asks first.
4. **Given** a change the server refuses (for example a stage move the member may not make), **When** it is refused, **Then** the cell goes back to its saved value and a message says why.

---

### User Story 5 - Undo and redo (Priority: P2)

A member undoes a mistake with Ctrl/Cmd+Z and redoes it with Ctrl/Cmd+Shift+Z or Ctrl+Y.

**Why this priority**: It makes bold editing (large pastes, clearing blocks) safe. P2 because the work is still usable without it.

**Independent Test**: Paste a 10 × 4 block, clear a column, then undo twice: the sheet is exactly as before the paste. Redo twice: it comes back.

**Acceptance Scenarios**:

1. **Given** a sequence of edits, **When** the member presses undo, **Then** the most recent change is reversed and saved; a paste, a clear or a row or column change counts as one step.
2. **Given** an undone change, **When** the member presses redo, **Then** it is applied again; a new edit after an undo clears the redo steps.
3. **Given** two sheets, **When** the member undoes, **Then** only the open sheet's changes are reversed.
4. **Given** undo and redo buttons in the sheet's toolbar, **When** there is nothing to undo or redo, **Then** the button is disabled.

---

### User Story 6 - Add, delete and resize rows and columns (Priority: P2)

A member right-clicks a row number or a column heading, or uses its ⋯ menu:
- insert a row above or below, or a column left or right;
- delete the selected rows or columns.

They also resize by dragging boundaries:
- a column's right edge in the header;
- a row's bottom edge in the row numbers.

**Why this priority**: The team reshapes sheets often, but the existing column tools (spec 010) already cover part of it.

**Independent Test**: In a blank sheet, insert two rows above row 3, delete column C, drag row 5 taller and column A wider, then reload. Everything is as left.

**Acceptance Scenarios**:

1. **Given** a row number's menu, **When** the member chooses Insert row above, **Then** an empty row appears there and the rows below move down; the same for below, and for columns left and right.
2. **Given** several selected rows, **When** the member chooses Delete rows, **Then** they are removed in one step, which can be undone.
3. **Given** a column heading's right edge, **When** the member drags it, **Then** the column's width follows the pointer; double-clicking the edge fits the widest content.
4. **Given** a row number's bottom edge, **When** the member drags it, **Then** the row's height follows the pointer, and long text in that row wraps to use it.
5. **Given** a resized row or column, **When** the page is reloaded, **Then** the size is kept, for that sheet only.

---

### User Story 7 - The linked sheets keep working as they do today (Priority: P2)

The Video and Content sheets gain the editing above, and keep everything they do now:
- status and person menus;
- links and files;
- grouping by video, theme and pillar;
- Paste clips and Paste plan;
- the column tools;
- board sync and celebrations.

**Why this priority**: The request is explicit that current design, content and behaviour are preserved.

**Independent Test**: Run the existing sheet checks unchanged. Then, in the Content sheet:
- copy five piece titles from Google Sheets and paste them over five existing titles;
- the five tasks are renamed on the board;
- a status pasted as "In design" moves the piece the same way the status menu would.

**Acceptance Scenarios**:

1. **Given** a linked sheet, **When** a member edits a text cell, **Then** the task's field changes on the board as it does today.
2. **Given** a value pasted into a status or person column, **When** it matches a stage name or a member's name, **Then** it is applied through the same rule as the menu; when it doesn't match, the cell is left unchanged and the member is told which cells were skipped.
3. **Given** a delete of rows in a linked sheet, **When** the member confirms, **Then** the rows are dropped or archived the way the sheet's Drop already does, never erased, and the action can be undone.
4. **Given** a column the pipeline needs (title, status), **When** the member opens its menu, **Then** Delete column is unavailable and explains why; the team's own columns can be deleted.
5. **Given** a linked sheet's grouping rows (a video, a theme, a pillar), **When** the member selects or pastes across them, **Then** their layout is not broken and values only land in cells that hold data.

### Edge Cases

- **A paste larger than the sheet.**
  - A blank sheet adds rows and columns to fit, up to its limits.
  - In a linked sheet, rows beyond the last one become new clips or pieces through the existing preview, and columns beyond the last are left out with a note.
- **Rich content on the clipboard.** Images, styling and formulas in a pasted table arrive as their plain text, or as the formula's last shown value.
- **Pasting into a block that doesn't match the copied shape.**
  - A copied single value fills the whole selection.
  - Otherwise the copied block is pasted once, from the top-left of the selection.
- **Cells that can't take a value.** For example:
  - a row number;
  - a grouping row's empty cells;
  - a cell computed from others (clip length);
  - a task the member may not edit (see FR-060).

  These are skipped, and the member is told how many cells were skipped and why.
- **Very long text.** It is kept in full. The cell shows what fits and wraps if the row is taller; double-click shows all of it.
- **Two people edit the same blank sheet.**
  - Each cell keeps the last saved value.
  - Edits to different cells never overwrite each other.
  - Others see the changes when they reload or reopen the tab.
- **A tab renamed to an existing name**, ignoring case and spaces, is refused. A name over 50 characters is cut to 50.
- **Deleting a sheet another person has open.** Their next save to it tells them it was deleted and offers to copy its content into a new sheet.
- **Undo across a reload.** History is for this visit only and is cleared on reload. Saved data is unaffected.
- **Undo of a change the server now refuses** (the task was archived meanwhile). The step is skipped with a message.
- **Phones (≤ 767 px).**
  - Tap selects, double-tap edits, and long-press opens the cell, row or column menu.
  - Drag-to-select is replaced by Select from a cell's menu and then tapping the far corner.
  - The tab bar sits above the bottom navigation.
- **Arabic.** The grid, selection, arrow keys and tab bar mirror. Letters for blank-sheet columns stay A, B, C, as in Google Sheets in Arabic.

## Requirements *(mandatory)*

### Functional Requirements

**Cells and editing**

- **FR-001**: Members MUST be able to select a cell with a single click and begin replacing its content by typing.
- **FR-002**: Double-clicking a cell, pressing Enter or pressing F2 MUST edit it with the existing text kept. A double-click places the cursor where clicked.
- **FR-003**: While editing:
  - Enter MUST keep the value and move down; Shift+Enter moves up.
  - Tab MUST keep the value and move right; Shift+Tab moves left.
  - Esc MUST abandon the edit.
  - Clicking another cell MUST keep the value.
  - Alt+Enter MUST insert a line break within the cell.
- **FR-004**: When not editing:
  - arrow keys MUST move the selection one cell;
  - Ctrl/Cmd+arrow moves to the edge of the data;
  - Home and End move to the row's first and last cell;
  - Page Up and Page Down move a screen at a time.
- **FR-005**: Delete and Backspace MUST empty every selected cell that can be emptied, in one undoable step.
- **FR-006**: Every existing cell type MUST keep its current way of editing:
  - text cells edit in place;
  - menu cells (status, editor, person) open their list on Enter or double-click, and typing filters it;
  - link and file cells open their prompt;
  - checkboxes toggle on Space.

**Selection**

- **FR-010**: Members MUST be able to select a rectangular block by:
  - dragging;
  - Shift+click;
  - Shift+arrow keys;
  - clicking a row number (the whole row) or a column heading (the whole column), with Shift and Ctrl/Cmd to extend or add;
  - Ctrl/Cmd+A (the whole sheet).
- **FR-011**: The selection MUST be clearly highlighted, with the active cell marked inside it and a count of the selected cells shown in the status area.
- **FR-012**: Dragging a selection past the visible edge MUST scroll the grid.

**Copy, cut and paste**

- **FR-020**: Copy (Ctrl/Cmd+C, and in the cell menu) MUST place the selection on the clipboard as rows and columns that Excel, Google Sheets and plain-text editors read as a table. Menu, link and person cells copy the text they show.
- **FR-021**: Cut MUST copy the selection and empty those cells when the paste happens, as one undoable step. Cutting cells that can't be emptied copies them only, with a note.
- **FR-022**: Paste (Ctrl/Cmd+V, and in the cell menu) MUST accept:
  - tables copied from Excel, Google Sheets, web pages and Momentum itself;
  - tab-separated and plain text.

  It MUST place them from the active cell, or the top-left of the selection.
- **FR-023**: A single pasted value MUST fill every cell of a selected block.
- **FR-024**: Line breaks and tabs inside a copied cell MUST survive a copy and paste between Momentum and Excel or Google Sheets.
- **FR-025**: After a paste, the pasted block MUST become the selection. Any cells skipped MUST be counted in a message that says why.
- **FR-026**: The existing "paste a list of clips" and "paste a content plan" previews MUST still open when what is pasted looks like new rows (spec 008 FR-030, spec 009). Pasting into existing cells MUST fill them directly.

**Undo and redo**

- **FR-030**: Each sheet MUST keep its own undo history for the visit, of at least 100 steps, covering:
  - cell edits;
  - clears;
  - pastes;
  - cuts;
  - row and column insertions, deletions and resizes.
- **FR-031**: Ctrl/Cmd+Z MUST undo and Ctrl/Cmd+Shift+Z or Ctrl+Y MUST redo. Undo and redo buttons MUST appear in the sheet's toolbar, and be disabled when there is nothing to do.
- **FR-032**: An undone or redone step MUST be saved like any edit, and MUST follow the same rules (FR-060). A step the server refuses is skipped with a message.

**Rows and columns**

- **FR-040**: The menus of a row number and a column heading MUST offer:
  - insert above / below (rows) or left / right (columns);
  - delete the selected rows or columns.

  They open by right-click, by a ⋯ button, or by Shift+F10 / the menu key.
- **FR-041**: In a blank sheet, inserting and deleting MUST shift the cells around them, as in Google Sheets.
- **FR-042**: In a linked sheet:
  - inserting a row MUST start a new clip or piece in that place, as "+ Clip" and "+ Piece" do today;
  - deleting rows MUST drop or archive them as the sheet's Drop does, after a confirmation naming the number of rows;
  - inserting a column MUST add a team column (spec 010);
  - deleting a column MUST be possible only for the team's own columns.
- **FR-043**: Dragging a column heading's edge MUST resize the column, and double-clicking the edge fits the widest content (spec 010 FR-010 is kept).
- **FR-044**: Dragging a row number's bottom edge MUST resize the row. Text in a taller row wraps. Double-clicking the edge returns the row to its normal height.
- **FR-045**: Column widths and row heights MUST be saved per sheet and shared by everyone who opens it, as spec 010 does for column widths.

**Sheet tabs**

- **FR-050**: A tab bar MUST sit along the bottom of the sheets area, as in Google Sheets. It shows every sheet in its saved order and highlights the open one.
- **FR-051**: A "+" button at the start of the bar MUST create a blank sheet, named "Sheet N" with the lowest N not in use, placed last and opened.
- **FR-052**: A new blank sheet MUST start with 100 empty rows and 26 columns (A–Z). Rows and columns can be added up to 5,000 rows and 200 columns.
- **FR-053**: Clicking a tab MUST open that sheet. Each sheet MUST keep its own content, column widths, row heights, selection and scroll position, independent of every other sheet.
- **FR-054**: Each tab MUST have a menu (right-click, or its ▾) with:
  - Rename;
  - Duplicate;
  - Delete;
  - Move left and Move right.

  Double-clicking a tab MUST also rename it.
- **FR-055**: Tab names MUST be 1–50 characters and unique among the sheets, ignoring case and surrounding spaces. A refused name says why and keeps the old one.
- **FR-056**: Duplicate MUST create "Copy of <name>" (with a number if taken) right after the original, with the same content, sizes and order, independent from then on.
- **FR-057**: Delete MUST ask for confirmation, remove the sheet and its content, and open the neighbouring tab. It MUST be unavailable when only one sheet remains, with a note saying so.
- **FR-058**: Tabs MUST be reorderable by dragging and by Move left / right, and the order MUST be saved.
- **FR-059**: When the tabs don't fit, the bar MUST scroll sideways, and a list button MUST show every sheet to jump to.

**Permissions and the linked sheets**

- **FR-060**: [NEEDS CLARIFICATION: Today a cell on a task is editable only by the task's owner, its assignee, admins and superusers. This follows the constitution's role tiers (§III), where a `user` edits their own tasks only. "Remove any read-only restrictions" could mean:
  - (a) keep that rule on the linked sheets (blank sheets are open to everyone);
  - (b) let every member edit every cell, which changes §III;
  - (c) open the team's own columns to everyone, but keep the rule for pipeline fields (stage, assignee).]
- **FR-061**: Stage changes made by typing, pasting or undoing MUST follow the same move rules and celebrations as the board (spec 008 FR-020–FR-024).
- **FR-062**: Every linked-sheet behaviour in specs 008, 009 and 010 that this spec doesn't change MUST keep working as it does today:
  - grouping and collapsing;
  - Paste clips and Paste plan;
  - Mine;
  - Show dropped;
  - column sets;
  - the column tools;
  - files and links;
  - opening the task panel;
  - search.

**Where the tabs live and who sees them**

- **FR-070**: [NEEDS CLARIFICATION: How do the new tabs relate to the two existing sheets?
  - (a) One tab bar holds the Video sheet and the Content sheet as permanent tabs, beside any blank sheets the team creates. The header's Content tab and Board | Sheet switch lead into this one sheets area.
  - (b) The Video and Content sheets stay where they are, with the new editing. Blank sheets live in a new, separate "Sheets" area with its own tab bar.
  - (c) Each existing sheet gets its own tab bar: blank sheets made from the Content sheet stay with it, and those made from the Video sheet stay with it.]
- **FR-071**: [NEEDS CLARIFICATION: Who sees a blank sheet?
  - (a) The whole team: everyone sees and edits every sheet, like a shared Google Drive folder.
  - (b) Only the member who made it.
  - (c) The whole team sees them, but only the creator and admins can rename, delete or reorder them.]

**Saving**

- **FR-080**: Every change MUST be saved automatically, without a Save button:
  - cell edits;
  - pastes;
  - clears;
  - row and column changes and sizes;
  - new, renamed, duplicated, deleted and reordered sheets.

  Saving begins within one second of the change.
- **FR-081**: A status in the sheet's toolbar MUST show "Saving…", "Saved", or "Not saved, retrying" (with the count of waiting changes). Changes that couldn't be saved MUST stay on screen and be retried. Leaving the page while changes are waiting MUST ask first.
- **FR-082**: On reload, the sheets area MUST open with the same tabs, names and order, every sheet's content and sizes, and the sheet the member last had open on that device.
- **FR-083**: A change refused by the server MUST put the cell back to its saved value and say why, without losing other changes.

**Language, keyboard and access**

- **FR-090**: Every new label, menu, message and status MUST exist in English and Arabic, and the grid, selection, keys and tab bar MUST mirror in Arabic.
- **FR-091**: Everything MUST be usable by keyboard alone:
  - the grid, as a grid;
  - the tab bar, as a list of tabs with arrow keys;
  - every menu.

  Screen readers MUST hear the active cell, the size of the selection, and the save status.
- **FR-092**: On a phone:
  - tap selects, double-tap edits;
  - long-press opens the menus;
  - the tab bar stays reachable above the bottom navigation;
  - touch targets are at least 44 px.

### Key Entities

- **Sheet:** one tab. It has:
  - a name (unique, 1–50 characters);
  - a position in the tab order;
  - its kind: the Video sheet, the Content sheet, or a blank sheet;
  - its column widths and row heights;
  - who created it and when.

  The two linked sheets always exist and can't be deleted.
- **Blank-sheet cell:** the text in one row and column of a blank sheet. Only cells with text are stored.
- **Blank-sheet layout:** a blank sheet's number of rows and columns, and any sizes that differ from the default.
- **Linked-sheet cell:** not a new thing. It is the task's field or team column value it shows today (specs 008–010).
- **Last open sheet:** which sheet a member last had open on a device, so a reload returns there.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A table of up to 1,000 rows × 20 columns copied from Excel or Google Sheets pastes into a blank sheet with every value in the right cell, in under 3 seconds.
- **SC-002**: A block copied from Momentum pastes into Excel and Google Sheets with the same rows, columns and cell text, including line breaks inside cells.
- **SC-003**: A member who knows Google Sheets can, without instructions:
  - edit a cell;
  - fill a block by pasting;
  - clear a block;
  - undo;
  - add a row;
  - create, rename and reorder a tab.

  They do all of this in under 2 minutes, in a moderated test of 5 people.
- **SC-004**: After any change and a "Saved" status, a reload shows the change 100% of the time, on the same device and another.
- **SC-005**: Moving the selection with the keyboard or switching tabs responds in under 100 ms for a sheet of 5,000 filled cells.
- **SC-006**: Every existing check of the Video and Content sheets still passes.
- **SC-007**: No sheet can end up without tabs: deleting the last sheet is impossible by any path.
- **SC-008**: Every new control is usable by keyboard alone and announces itself correctly, with no serious accessibility violations in English or Arabic.

## Assumptions

- **No formulas.** Text that starts with "=" is stored as typed and shown as text.
- **"Formatting" means layout.** It covers column widths, row heights, column order and hidden columns. Text styling (bold, colours, borders) and merged cells are not part of this feature.
- **No live co-editing.** Changes by others appear on reload, or when the tab is reopened. For a blank sheet, each cell keeps the last saved value.
- **Undo history is per sheet and per visit.** It isn't kept across reloads, as in most web editors other than Google's.
- **Sizes are shared.** Column widths and row heights are shared by the team, as column widths already are (spec 010). The open tab and the scroll position are remembered per member on each device.
- **Clipboard.** Paste and copy use the browser's own clipboard keys. Where a browser blocks menu-driven paste, the menu says to use Ctrl/Cmd+V.
- **Size limit.** A blank sheet's limit (5,000 rows × 200 columns) is well above the team's current Google Sheets. Larger imports are out of scope.
- **Who can create sheets.** Everyone who can open the sheets today can create blank sheets, subject to FR-071.
