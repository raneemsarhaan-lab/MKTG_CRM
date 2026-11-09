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

**Where it lives.** A new **Sheets** section in the sidebar holds **folders**, and a folder opens like one Google Sheets or Excel file: its sheets are tabs along the bottom.
- **Content** and **Video** are the two linked folders. Their first sheet is the existing Content sheet or Video sheet, and the team can add blank sheets beside it.
- **Team folders** ("Campaign planning", "Event logistics"…) hold blank sheets only.
- **Sheets opens a home page** of folder cards. The folders a member pins (Content and Video by default) also sit under Sheets in the sidebar, one click away.
- **The Board's Content tab and Sheet view stay** as shortcuts to the same linked sheets.
- **The design** of this layout: `design/sheets-options.html`, option C.

**Two kinds of sheet**, used throughout this spec:
- **Linked sheet:** the Video sheet and the Content sheet. Rows are tasks; some cells are pipeline fields with rules of their own (a stage, a person, a link).
- **Blank sheet:** a new sheet created with "+". A plain grid of text cells with letter columns (A, B, C…) and numbered rows, like a new Google Sheet. No link to tasks.

**Out of scope:** formulas and calculations, cell styling (bold, colours, borders), merged cells, charts, filters, live co-editing, and Excel's macros ("View Code").

## Clarifications

### Session 2026-11-09

- Q: Where do the tabs live, relative to the Video and Content sheets? → A: In a new **Sheets** section in the sidebar, made of folders. Content and Video are linked folders whose first tab is the existing sheet; team folders hold blank sheets. Sheets opens a home page of folder cards, and pinned folders (Content and Video by default) sit under Sheets in the sidebar (design option C).
- Q: Who sees a blank sheet? → A: The whole team sees and edits every folder and sheet, like a shared Drive folder. A sheet can be protected from editing (Excel's Protect Sheet).
- Q: Who may edit cells on tasks? → A: Blank sheets are open to everyone. On the linked sheets, the team's own columns are open to everyone; pipeline fields (title, stage, assignee and the other task fields) keep today's rule: the task's owner, its assignee, admins and superusers.
- Q: The Board's Content tab and Sheet view? → A: They stay, as shortcuts to the same linked sheets.
- Q: Tab options? → A: As in Excel's sheet-tab menu: Insert, Delete, Rename, Move or Copy, Protect Sheet, Tab Color, Hide, Unhide and Select All Sheets (not View Code).

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

### User Story 3 - The Sheets section and its folders (Priority: P1)

A member opens **Sheets** in the sidebar:
- a home page shows the folders as cards: Content and Video first (linked to the board), then the team's folders;
- each card shows how many sheets the folder holds and when it was last edited;
- the member opens a folder, makes a new one, renames or deletes a team folder, and pins the folders they use most so they sit under Sheets in the sidebar.

**Why this priority**: It's the way into every sheet. Without it, new sheets have nowhere to live.

**Independent Test**: Open Sheets: Content and Video are there, and pinned in the sidebar. Create a folder named "Campaign planning": it opens with one sheet, "Sheet 1". Pin it: it appears under Sheets in the sidebar. Reload: all of it is as left.

**Acceptance Scenarios**:

1. **Given** any page, **When** the member clicks Sheets in the sidebar, **Then** the Sheets home opens with the linked folders first and the team folders after them, each card showing its sheet count and last edit.
2. **Given** the Sheets home, **When** the member presses New folder and names it, **Then** the folder is created with one blank sheet, "Sheet 1", and opens.
3. **Given** a folder, **When** it opens, **Then** it shows the sheet the member last had open there, with its tabs along the bottom, and a breadcrumb "Sheets › <folder>" to go back.
4. **Given** a folder's menu (on its card, or in the sidebar), **When** the member chooses Pin or Unpin, **Then** the folder appears under, or leaves, Sheets in their own sidebar. Content and Video are pinned by default.
5. **Given** a team folder, **When** the member renames it or deletes it (after a confirmation naming its sheets), **Then** the change is saved for everyone. Content and Video can't be renamed or deleted.
6. **Given** the Board, **When** the member uses its Content tab or Sheet view, **Then** they see the same linked sheet as Sheets › Content or Sheets › Video, with the same editing.
7. **Given** a phone, **When** the member opens the navigation, **Then** Sheets is in the bottom bar and opens the same home page.

---

### User Story 4 - Sheet tabs at the bottom, with Excel's tab options (Priority: P1)

A member manages a folder's sheets from a tab bar at the bottom, as in Excel and Google Sheets:
- "+" creates a blank sheet with the next free name;
- clicking a tab switches to it;
- tabs can be dragged into a new order, and Ctrl+drag copies one.

Right-clicking a tab opens Excel's menu:
- **Insert**;
- **Delete**;
- **Rename**;
- **Move or Copy…**;
- **Protect Sheet…**;
- **Tab Color**;
- **Hide**;
- **Unhide…**;
- **Select All Sheets**.

**Why this priority**: Without tabs there is no way to make or manage a sheet, and the request names each of these actions.

**Independent Test**: In a team folder:
- press "+" twice: "Sheet 2" and "Sheet 3" appear (the next free numbers) and the last is open;
- rename one, colour it green, Move or Copy it to the front as a copy, protect it, hide another and unhide it, then delete the copy.

Reload: the tabs, names, colours, order, hidden state and protection are as left. Try to delete or hide the only visible sheet: it can't be done.

**Acceptance Scenarios**:

1. **Given** a folder, **When** it opens, **Then** a tab bar along the bottom shows its visible sheets in their saved order, with the open one clearly highlighted.
2. **Given** the tab bar, **When** the member presses "+" (or Shift+F11), **Then** a blank sheet named "Sheet N" (the lowest N not used in the folder) is created after the open sheet and opened.
3. **Given** two tabs, **When** the member clicks the other tab (or presses Ctrl+Page Down / Page Up), **Then** that sheet opens with its own content, column widths, row heights and scroll position; the first sheet's are unchanged.
4. **Given** a tab's menu, **When** the member chooses **Insert**, **Then** a blank sheet with the next free name is inserted before that tab and opened.
5. **Given** a tab, **When** the member double-clicks it or chooses **Rename**, **Then** they can type a new name; Enter saves and Esc cancels. An empty name, or one already used in the folder, is refused with a message.
6. **Given** a tab's menu, **When** the member chooses **Move or Copy…**, **Then** a dialog asks for:
   - the folder (this one or another);
   - the sheet to place it before (or "move to end");
   - whether to **Create a copy**.

   With a copy, a sheet named "<name> (2)" (next free number) appears there, with the same content and sizes, independent from then on. Without a copy, the sheet moves.
7. **Given** several tabs, **When** the member drags a tab, **Then** it moves there and the order is kept after a reload; Ctrl+drag (Option+drag on Mac) drops a copy instead.
8. **Given** a tab's menu, **When** the member chooses **Tab Color** and a colour (or No Color), **Then** the tab shows that colour, for everyone, and the open tab keeps a clear highlight on top of it.
9. **Given** a tab's menu, **When** the member chooses **Protect Sheet…** and confirms, **Then** the sheet shows a lock on its tab. Only its protector and admins can then edit its cells, rows and columns, or unprotect it; others see why when they try.
10. **Given** a tab's menu, **When** the member chooses **Hide**, **Then** the tab disappears for everyone and the next tab opens. **Unhide…** lists the hidden sheets, and the chosen one comes back in its place and opens.
11. **Given** a tab's menu, **When** the member chooses **Select All Sheets** (or Ctrl/Shift+clicks tabs), **Then** those tabs are grouped. Delete, Move or Copy, Tab Color and Hide then act on all of them at once. Clicking any single tab ends the grouping.
12. **Given** a blank sheet's tab, **When** the member chooses **Delete** and confirms, **Then** the sheet and its content are removed and the neighbouring tab opens.
13. **Given** only one visible sheet remains in a folder, **When** the member opens its menu, **Then** Delete and Hide are unavailable and explain why.
14. **Given** a linked sheet's tab (the Content or Video sheet), **When** the member opens its menu, **Then** Delete, Rename, Hide, Protect Sheet and moving it to another folder are unavailable with a note. Insert, Tab Color, reordering, and Move or Copy as a copy (a blank sheet holding its current text) are available.
15. **Given** more tabs than fit, **When** the bar overflows, **Then** scroll arrows appear at its start, as in Excel. Right-clicking them, or the ≡ button, lists every sheet to jump to.

---

### User Story 5 - Everything saves itself and comes back (Priority: P1)

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

### User Story 6 - Undo and redo (Priority: P2)

A member undoes a mistake with Ctrl/Cmd+Z and redoes it with Ctrl/Cmd+Shift+Z or Ctrl+Y.

**Why this priority**: It makes bold editing (large pastes, clearing blocks) safe. P2 because the work is still usable without it.

**Independent Test**: Paste a 10 × 4 block, clear a column, then undo twice: the sheet is exactly as before the paste. Redo twice: it comes back.

**Acceptance Scenarios**:

1. **Given** a sequence of edits, **When** the member presses undo, **Then** the most recent change is reversed and saved; a paste, a clear or a row or column change counts as one step.
2. **Given** an undone change, **When** the member presses redo, **Then** it is applied again; a new edit after an undo clears the redo steps.
3. **Given** two sheets, **When** the member undoes, **Then** only the open sheet's changes are reversed.
4. **Given** undo and redo buttons in the sheet's toolbar, **When** there is nothing to undo or redo, **Then** the button is disabled.

---

### User Story 7 - Add, delete and resize rows and columns (Priority: P2)

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

### User Story 8 - The linked sheets keep working as they do today (Priority: P2)

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
- **A tab renamed to an existing name** in the same folder, ignoring case and spaces, is refused. A name over 50 characters is cut to 50. Excel's forbidden characters (`\ / ? * [ ] :`) are refused too, so names survive a copy to Excel.
- **Move or Copy into a folder that already has that name.** The moved or copied sheet gets the next free number, "(2)", "(3)".
- **Hiding.** The last visible sheet of a folder can't be hidden. A grouped Hide that would hide every sheet leaves the open one visible and says so.
- **Protection.** A protected sheet can still be opened, selected, copied, hidden by its protector, coloured and moved; cells, rows, columns and sizes can't be changed. A paste or Delete into it is refused with a note. An admin can always unprotect it.
- **Deleting a team folder** deletes its sheets after a confirmation naming how many. It can be undone from a message for 10 seconds.
- **Ctrl+drag on a linked tab** makes a blank copy holding its current text; the linked sheet itself never moves to another folder.
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

- **FR-050**: A tab bar MUST sit along the bottom of an open folder, as in Excel and Google Sheets. It shows the folder's visible sheets in their saved order, each in its tab colour, and clearly highlights the open one.
- **FR-051**: A "+" button MUST create a blank sheet, named "Sheet N" with the lowest N not used in the folder, placed after the open sheet and opened. Shift+F11 does the same.
- **FR-052**: A new blank sheet MUST start with 100 empty rows and 26 columns (A–Z). Rows and columns can be added up to 5,000 rows and 200 columns.
- **FR-053**: Clicking a tab, or Ctrl+Page Up / Page Down, MUST open that sheet. Each sheet MUST keep its own content, column widths, row heights, selection and scroll position, independent of every other sheet.
- **FR-054**: Right-clicking a tab (or its ▾, or Shift+F10 on a focused tab) MUST open Excel's sheet-tab menu:
  - Insert;
  - Delete;
  - Rename;
  - Move or Copy…;
  - Protect Sheet… / Unprotect Sheet;
  - Tab Color;
  - Hide;
  - Unhide…;
  - Select All Sheets.

  An option that doesn't apply is shown disabled, with the reason.
- **FR-055**: **Insert** MUST add a blank sheet with the next free name before the tab and open it.
- **FR-056**: **Rename**, or a double-click on the tab, MUST let the member edit the name in place. Names MUST:
  - be 1–50 characters;
  - be unique in the folder, ignoring case and surrounding spaces;
  - have none of `\ / ? * [ ] :`.

  A refused name says why and keeps the old one.
- **FR-057**: **Delete** MUST ask for confirmation, remove the sheet and its content, and open the neighbouring tab. It MUST be unavailable for a linked sheet, and when the sheet is the folder's only visible sheet.
- **FR-058**: **Move or Copy…** MUST open a dialog with:
  - the destination folder;
  - a list of its sheets to place it before, plus "(move to end)";
  - a **Create a copy** checkbox.

  A copy is independent from then on. A name already used at the destination gets "(2)", "(3)". A linked sheet can only be copied, and the copy is a blank sheet holding its current text.
- **FR-059**: Tabs MUST be reorderable by dragging. Ctrl+drag (Option+drag on Mac) MUST drop a copy. Keyboard users get the same through Move or Copy. Every order change MUST be saved.
- **FR-059a**: **Tab Color** MUST offer a palette of at least 10 colours and No Color. The colour is saved and seen by everyone.
- **FR-059b**: **Protect Sheet…** MUST lock the sheet's cells, rows, columns and sizes against edits by anyone but the member who protected it and admins. The tab shows a lock. **Unprotect Sheet** is offered to the same people. Linked sheets can't be protected (their rules are FR-060).
- **FR-059c**: **Hide** MUST hide the sheet from the tab bar for everyone. **Unhide…** MUST list the folder's hidden sheets; the chosen one returns to its place and opens. The last visible sheet can't be hidden.
- **FR-059d**: **Select All Sheets**, or Ctrl/Shift+click on tabs, MUST group tabs. While grouped, Delete, Move or Copy, Tab Color and Hide act on all of them in one step, and the grouping is visible on the tabs. A click on a single tab ends it. Typing into cells always affects only the open sheet.
- **FR-059e**: When the tabs don't fit, scroll arrows MUST appear at the bar's start, as in Excel. Right-clicking them, or a ≡ button, MUST list every visible sheet to jump to.

**Permissions and the linked sheets**

- **FR-060**: Who may edit what:
  - **Blank sheets:** every member may edit them, unless the sheet is protected (FR-059b).
  - **Linked sheets, the team's own columns (spec 010):** every member may edit them on every row.
  - **Linked sheets, pipeline fields** (title, stage, assignee, owner, dates, priority, links, files and the other task fields): today's rule stays. They are editable by the task's owner, its assignee, admins and superusers (constitution §III).
  - A cell a member may not edit says so when they try, and is skipped in pastes and clears with a count.
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

**The Sheets section and folders**

- **FR-070**: The sidebar MUST have a **Sheets** item, below Board, for every member. On a phone it MUST be in the bottom navigation.
- **FR-071**: Sheets MUST open a home page of folder cards: Content and Video first, then the team's folders by name. Each card shows the folder's name, its number of sheets, and when and by whom it was last edited.
- **FR-072**: The folders a member pins MUST appear under Sheets in their sidebar, in pin order. Content and Video are pinned by default. Pin and Unpin are in each folder's menu (on its card and in the sidebar), and are per member.
- **FR-073**: **New folder** MUST create a team folder with the name given (1–60 characters, unique among folders) and one blank sheet, "Sheet 1", and open it.
- **FR-074**: A team folder's menu MUST offer Rename and Delete. Delete asks for confirmation naming how many sheets it holds, and can be undone from a message for 10 seconds. Content and Video can't be renamed or deleted.
- **FR-075**: Every member MUST see and open every folder and sheet; there are no private folders in this feature.
- **FR-076**: An open folder MUST show a breadcrumb "Sheets › <folder>" and open on the sheet the member last had open there, on that device.
- **FR-077**: The Content and Video folders' first sheet MUST be the existing linked sheet. It can't be deleted, renamed, hidden, protected or moved out of its folder.
- **FR-078**: The Board header's Content tab and Sheet view MUST keep working and show the same linked sheets, with the same editing. A change made in one place shows in the other.

**Saving**

- **FR-080**: Every change MUST be saved automatically, without a Save button:
  - cell edits;
  - pastes;
  - clears;
  - row and column changes and sizes;
  - new, renamed, copied, moved, deleted, hidden, coloured, protected and reordered sheets;
  - folders, and each member's pins.

  Saving begins within one second of the change.
- **FR-081**: A status in the sheet's toolbar MUST show "Saving…", "Saved", or "Not saved, retrying" (with the count of waiting changes). Changes that couldn't be saved MUST stay on screen and be retried. Leaving the page while changes are waiting MUST ask first.
- **FR-082**: On reload, Sheets MUST show the same folders, pins, tabs, names, order, colours, hidden and protected states, every sheet's content and sizes, and in each folder the sheet the member last had open on that device.
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

- **Folder:** a set of sheets, opened as one workbook. It has:
  - a name;
  - its kind: the Content folder, the Video folder, or a team folder;
  - who created it, and when it was last edited and by whom.

  Content and Video always exist.
- **Pin:** a member's choice to show a folder under Sheets in their sidebar, with its place in their list.
- **Sheet:** one tab in a folder. It has:
  - a name (unique in the folder);
  - a position;
  - a tab colour;
  - whether it is hidden;
  - whether it is protected, and by whom;
  - its kind: the linked Content sheet, the linked Video sheet, or a blank sheet;
  - its column widths and row heights;
  - who created it and when.
- **Blank-sheet cell:** the text in one row and column of a blank sheet. Only cells with text are stored.
- **Blank-sheet layout:** a blank sheet's number of rows and columns, and any sizes that differ from the default.
- **Linked-sheet cell:** not a new thing. It is the task's field or team column value it shows today (specs 008–010).
- **Last open sheet:** per member, per device and per folder, so a folder reopens where it was left.

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
  - create, rename and reorder a tab;
  - colour, hide and unhide a tab, and copy it to another folder.

  They do all of this in under 3 minutes, in a moderated test of 5 people.
- **SC-004**: After any change and a "Saved" status, a reload shows the change 100% of the time, on the same device and another.
- **SC-005**: Moving the selection with the keyboard or switching tabs responds in under 100 ms for a sheet of 5,000 filled cells.
- **SC-006**: Every existing check of the Video and Content sheets still passes.
- **SC-007**: No folder can end up without a visible tab: deleting or hiding its last visible sheet is impossible by any path.
- **SC-009**: Content and Video are one click away from any page (their pinned entries), and any other folder is at most two clicks away (Sheets, then its card).
- **SC-008**: Every new control is usable by keyboard alone and announces itself correctly, with no serious accessibility violations in English or Arabic.

## Assumptions

- **No formulas.** Text that starts with "=" is stored as typed and shown as text.
- **"Formatting" means layout.** It covers column widths, row heights, column order and hidden columns. Text styling (bold, colours, borders) and merged cells are not part of this feature.
- **No live co-editing.** Changes by others appear on reload, or when the tab is reopened. For a blank sheet, each cell keeps the last saved value.
- **Undo history is per sheet and per visit.** It isn't kept across reloads, as in most web editors other than Google's.
- **Sizes are shared.** Column widths and row heights are shared by the team, as column widths already are (spec 010). The open tab and the scroll position are remembered per member on each device.
- **Clipboard.** Paste and copy use the browser's own clipboard keys. Where a browser blocks menu-driven paste, the menu says to use Ctrl/Cmd+V.
- **Size limit.** A blank sheet's limit (5,000 rows × 200 columns) is well above the team's current Google Sheets. Larger imports are out of scope.
- **Who can create sheets and folders.** Every member, in every folder, as on a shared Drive.
- **Select All Sheets groups tabs for tab actions only.** Excel's group editing, where typing into one sheet writes into all grouped sheets, is out of scope.
- **Protection is per sheet.** Excel's options inside Protect Sheet (allow selecting locked cells, formatting, a password) are reduced to on or off. There is no password, because members are already signed in.
- **Duplicate** (named in the original request) is done the Excel way: Move or Copy with Create a copy, or Ctrl+drag of a tab.
- **Tab colours** are a fixed palette, like Excel's theme colours. There is no custom colour picker.
