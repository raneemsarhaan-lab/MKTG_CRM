# UI contracts: sheet task links

The design comes first, in `design/sheet-task-links.html` (constitution §IV). It must be approved before any UI is built. Every control gets a `data-` attribute for the labs.

## 1. Link to board… (`data-link-board`)

- **Where:** the sheet tab menu, and the toolbar's Editing group (a "Board" button with ▾).
- **The dialog:**
  - **Step 1, choose the Task column.** A list of the sheet's columns, named by their first row's text.
  - **Step 2, map fields.** For each other column, a field picker. A picked field is greyed out elsewhere.
  - **The result:** "9 linked · 1 not found · 1 to choose". Two buttons: Review (opens the side list) and Done.
- **Changing the link later:** the same dialog, opened from the menu. It has an "Unlink sheet" button, which asks first.

## 2. In the grid

- **Mapped headings:** a badge with the field's name (`data-field-badge`). The tooltip reads "Linked to the board: Stage".
- **Linked rows:** a task marker in the row number (`data-task-marker`). Clicking it opens the task modal, as on the board.
- **Rows that need attention:**
  - "Not linked" and "2 tasks have this title" show as a small note in the Task cell (`data-link-note`). Clicking it opens Choose a task.
  - "Task removed" and dropped tasks show the same way.
- **Mapped cells:**
  - A subtle tint, a design token (`--sh-linked`), under any formatting.
  - A Stage cell shows the stage pill. Assignee and Owner cells show the member's name.
  - "Not applicable" cells are muted and say why when typed into.
- **Editing:** typing, paste, fill, replace and clear behave as in any cell. Refusals show:
  - as the cell's own note when a single cell is edited;
  - as "N not changed (you can't edit them)" for a batch.

## 3. Choose a task (`data-choose-task`)

- **The list:** the matching tasks, each with its stage, project and assignee.
- **Search:** finds any other task.
- **Picking one:** links the row and puts the task's link in the Task cell, as one undo step.

## 4. Add tasks… (`data-add-tasks`)

- **Where:** the row menu and the Board ▾ menu.
- **The dialog:**
  - a search box;
  - filters by stage, person and project;
  - a list with tick boxes, showing up to 50 matches.
- **Adding:** Add inserts one linked row per task, below the selection. It is one undo step.

## 5. Create tasks for rows… (`data-create-tasks`)

- **Where:** the row menu, when the selection has unlinked rows, and the Board ▾ menu.
- **The preview, like Paste plan:**
  - **To create:** title, due, assignee and stage "To do".
  - **Problems:** fixable in place, or left out.
  - **One due date** for rows without one.
- **Create:** makes the tasks, links the rows and shows a message.
- **Undo:** unlinks the rows, keeps the tasks, and says so.
- **If the member can't create tasks:** the item is shown disabled with the reason.

## 6. Phones and Arabic

- **Phones (390 px):**
  - the dialogs are full-screen sheets with 44 px targets;
  - the task marker and the badges stay visible.
- **Arabic:** every string is in Arabic, with Arabic plurals. Badges and markers mirror.
- **Accessibility:** axe finds no serious or critical issues on the link dialog, Choose a task, Add tasks or Create tasks.
