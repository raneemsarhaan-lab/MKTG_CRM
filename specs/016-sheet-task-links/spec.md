# Feature Specification: Link a Blank Sheet's Columns to Board Tasks

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Link a blank sheet's columns to board tasks (option B). In any blank sheet, a member can pick one column that identifies the task for each row (by task link or task title). Then they map other columns to task fields: title, stage/status, due date, assignee, pillar/theme, and the link columns (brief, design, video, final). Edits in mapped cells save to the task with the same rules and permissions as editing on the Content sheet. Changes made on the board show up in the mapped cells. Unmapped columns stay free-form sheet cells. Rows without a matching task can create a new task (with a confirmation preview, like Paste plan), or stay unlinked. The sheet keeps its own layout, formatting, comments and the other sheet tools."

## Context

Today a sheet is one of two kinds:

- **Linked** (Content and Video). Every row is a board task, and every edit saves to that task.
- **Blank.** The sheet keeps its own cells and never touches tasks.

Teams already plan in blank sheets with their own layout: extra columns, notes, colours, comments. Then they copy the plan into the Content sheet with Paste plan. After that the two drift apart.

This feature lets a blank sheet keep its own layout while chosen columns stay in step with the board.

## Clarifications

### Session 2026-11-11

- Q: Which tasks can a sheet row link to? → A: **Any task in the pipeline** (Content pieces, Video tasks and clips, project tasks).
- Q: Where do tasks created from unlinked rows go? → A: **Plain board tasks in the first stage**, with no theme or pillar.
- Q: Should a sheet fill itself with tasks automatically? → A: **No.** Rows are only added by people (typing, pasting, inserting, or Add tasks…).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect rows to their tasks (Priority: P1)

A member has a blank sheet listing posts for the month. One column holds each post's task link (or its title). They choose **Link to board…**, pick that column as the **Task column**, and every row whose value matches a task is linked. Linked rows show a small task marker in the row number. Clicking the marker opens the task. Rows that don't match are listed so they can be fixed.

**Why this priority**: Nothing else works until rows know their tasks. On its own it already helps: one click from any row to its task.

**Independent Test**: In a blank sheet with 10 rows (8 task links, 1 exact title, 1 unknown title), set the Task column. 9 rows show the marker and open the right task. One row is reported as "No matching task".

**Acceptance Scenarios**:

1. **Given** a blank sheet whose column B holds task links, **When** the member picks B as the Task column, **Then** every row whose link is a board task is linked, and the result reads "9 linked, 1 not found".
2. **Given** a value that is a task's exact title, shared by no other task, **When** the column is linked, **Then** that row is linked to it.
3. **Given** a title shared by two tasks, **When** the column is linked, **Then** the row is listed as "2 tasks have this title". The member picks one, and the cell then holds that task's link.
4. **Given** a linked row, **When** the member types a different task's link in its Task cell, **Then** the row links to that task. Its mapped cells fill from the new task, and one undo restores the previous link and values.
5. **Given** a linked sheet, **When** another member opens it, **Then** they see the same links and markers.

---

### User Story 2 - Map columns to task fields and edit them both ways (Priority: P1)

The member maps columns to task fields: C → Title, D → Stage, E → Due date, F → Assignee, G → Design link. Mapped headings show a link badge with the field's name. Mapped cells on linked rows show the task's current value.

Typing, pasting, filling, replacing, clearing and undoing in a mapped cell save to the task. Every Content sheet rule applies (who may edit, stage move rules, celebrations, link checks). Changes made on the board, in the task modal or on the Content sheet show in the mapped cells. Unmapped columns stay ordinary sheet cells.

**Why this priority**: This is the point of the feature: one plan, kept in step with the board without copying.

**Independent Test**: Map Title, Stage and Due date. Change a title in the sheet: the board shows it. Move the task's stage on the board: the sheet's Stage cell shows it after a refresh or within the usual refresh time. Paste 5 stages where the member owns 3 tasks: 3 change, and the message reads "2 not changed (you can't edit them)".

**Acceptance Scenarios**:

1. **Given** column C is mapped to Title on a linked row, **When** the member types a new title, **Then** the task is renamed everywhere it appears. One undo puts the old title back on the task.
2. **Given** column D is mapped to Stage, **When** the member types or picks a stage the move rules don't allow, **Then** the cell is refused with the same message as on the Content sheet, and nothing changes.
3. **Given** a member who is not the task's owner, assignee or an admin, **When** they edit a mapped cell, **Then** it is refused with "You can't edit this task". In pastes, fills and replaces, such cells are skipped and counted.
4. **Given** a mapped Assignee column, **When** a name is typed, **Then** it matches a member as on the Content sheet. An unknown name is refused with its reason.
5. **Given** another member changes the task on the board, **When** the sheet refreshes, **Then** the mapped cell shows the new value. The sheet's own formatting and comments on that cell are kept.
6. **Given** an unmapped column, **When** the member types in it, **Then** it saves as a sheet cell and never touches the task.
7. **Given** a mapped column, **When** the member unmaps it, **Then** the cells keep their current values as plain sheet text and stop following the task.
8. **Given** a row that is not linked, **When** the member types in a mapped column, **Then** the value is kept as plain sheet text. The row shows "Not linked" until it is linked or a task is created for it.

---

### User Story 3 - Create tasks for rows that have none (Priority: P2)

Some rows are new ideas with no task yet. The member selects them and chooses **Create tasks for rows…**. A preview, like Paste plan, shows each new task built from the mapped columns, any problems to fix (missing title, unknown stage, bad link), and the rows that will be left out. On confirm, the tasks are created, the rows are linked, and their Task cells hold the new tasks' links.

**Why this priority**: It saves the copy-into-Content step for new work. Linking existing tasks (US1–US2) is useful without it.

**Independent Test**: With 4 unlinked rows (3 valid, 1 with no title), the preview lists 3 to create and 1 problem. After a confirm, 3 tasks are on the board with the mapped values, and their rows are linked.

**Acceptance Scenarios**:

1. **Given** 3 unlinked rows with a title, **When** the member confirms the preview, **Then** 3 tasks are created on the board in the first stage, and the rows are linked.
2. **Given** a row with a problem, **When** the preview opens, **Then** it is shown with its reason and can be fixed in place or left out.
3. **Given** tasks were just created, **When** the member presses undo, **Then** the rows are unlinked. The tasks are kept, and the message says so, as Paste plan does today.

---

### User Story 4 - Keep the sheet's own tools (Priority: P2)

The linked sheet is still a blank sheet. Row and column insert, delete and move; sizes; formatting; comments; merges; freeze; hide; Find & Replace; sort and filter (when spec 015 stage 3 lands); tabs; and protection all keep working. Mapped cells look like other cells, apart from the heading badge and a subtle tint.

**Why this priority**: Members chose a blank sheet for its freedom, and linking must not take it away.

**Independent Test**: In a linked sheet, colour a mapped column, comment on a mapped cell, freeze row 1, move a mapped column and delete a linked row. All of these keep working and save. Deleting the row never deletes the task.

**Acceptance Scenarios**:

1. **Given** a linked row, **When** the member deletes the row, **Then** only the sheet row is removed. The task stays on the board, and undo brings the row and its link back.
2. **Given** a mapped column, **When** it is moved or resized, **Then** the mapping moves with it.
3. **Given** a mapped column, **When** it is deleted, **Then** the mapping is removed, and undo restores both the column and its mapping.
4. **Given** a protected linked sheet, **When** a member who may not edit the sheet edits a mapped cell, **Then** it is refused, even if they may edit the task.

---

### Edge Cases

- **The task is deleted or dropped on the board.** The row shows "Task removed", and its mapped cells keep their last values as plain text. Re-linking is offered.
- **The same task is in two rows, or in two sheets.** Allowed. Every row shows the same task values, and an edit in one shows in the others after a refresh.
- **Two members edit the same task at once, in the sheet and on the board.** The last save wins, as on the Content sheet. A refresh shows the result.
- **A field doesn't fit the cell's value** (a date column receives "next week", a stage name is misspelt). The cell is refused with the reason, and pastes count it as skipped.
- **A Task column cell is cleared.** The row is unlinked. Mapped cells keep their values as plain text, and undo re-links.
- **A large sheet.** Linking 2,000 rows reports the result in one message. Rows load their task values without slowing scrolling.
- **A task that isn't a content piece** (a video, a clip, a project task). Fields only content pieces have (Theme, Pillar) show as "Not applicable" on that row.
- **Two columns mapped to the same field.** Not allowed: mapping a field already in use moves it to the new column, after a confirmation.

## Requirements *(mandatory)*

### Functional Requirements

**Linking rows**

- **FR-001**: A blank sheet MUST offer **Link to board…** (sheet tab menu and toolbar), where a member picks one column as the **Task column**.
- **FR-002**: A Task cell MUST match a task by its task link (the link the board's Copy link gives), or by an exact title shared by no other task. A title shared by more than one task MUST be listed for the member to pick from.
- **FR-003**: Linking MUST report how many rows were linked, how many matched no task, and how many need a choice. Unmatched rows MUST be marked "Not linked".
- **FR-004**: A linked row MUST show a task marker in its row number. Clicking it opens the task.
- **FR-005**: Changing, clearing or pasting into a Task cell MUST re-link or unlink the row as one undoable step.
- **FR-006**: A row MAY link to any task in the pipeline: Content pieces, Video tasks and their clips, and project tasks. Fields a task doesn't have (Theme and Pillar on a non-content task, for example) show as "Not applicable" on that row, and edits there are refused with that reason.

**Mapping columns**

- **FR-010**: A member MUST be able to map a column to one of these task fields:
  - Title, Stage, Due date, Assignee, Owner, Priority, Platform, Content type, Theme, Pillar;
  - the link columns (brief/doc, design, post, published);
  - the team's own Content-sheet columns (spec 010).

  Each field may be mapped to at most one column per sheet.
- **FR-011**: Mapped headings MUST show a badge naming the field. Mapped cells on linked rows MUST show the task's current value, in the same display as the Content sheet (stage pill, member name, date in the member's language).
- **FR-012**: An edit to a mapped cell on a linked row MUST save to the task. This covers typing, paste, Paste Special values, fill, replace, clear, cut and undo or redo. Every Content sheet rule applies:
  - who may edit (spec 013 FR-060);
  - stage move rules and celebrations (spec 013 FR-061);
  - member and link checks.

  Refused cells MUST be skipped and counted in one message.
- **FR-013**: Changes made to a linked task anywhere else MUST show in its mapped cells, on opening the sheet and while it is open, within the same refresh time as the Content sheet.
- **FR-014**: Unmapping a column MUST keep its current values as plain sheet cells.
- **FR-015**: Unmapped columns, and mapped cells on rows that aren't linked, MUST behave as ordinary blank-sheet cells.
- **FR-016**: Mapping MUST be undoable, and MUST be saved with the sheet so every member sees the same mapping.

**Creating tasks**

- **FR-030**: **Create tasks for rows…** MUST open a preview, as Paste plan does: tasks to create, rows with problems (fixable in place or left out), and rows left out. On confirm, the tasks are created from the mapped columns and the rows are linked. New tasks are plain board tasks in the pipeline's first stage. They have no theme or pillar, so they don't appear on the Content sheet until someone puts them in one. The member creating them becomes each task's owner, unless an Owner column is mapped.
- **FR-031**: Undoing a creation MUST unlink the rows and keep the tasks, saying so.

**Sheet behaviour**

- **FR-040**: A linked sheet MUST keep every blank-sheet tool (specs 013 and 015). These include rows, columns, sizes, formatting, comments, merges, freeze, hide, Find & Replace, tabs and protection.
- **FR-041**: Deleting a row or a sheet MUST never delete or change a task.
- **FR-042**: Moving, hiding or resizing a mapped column MUST keep its mapping. Deleting it removes the mapping, and undo restores both.
- **FR-043**: On a protected sheet, mapped cells MUST follow both rules. The member must be allowed to edit the sheet and the task.
- **FR-044**: Rows MUST only be added by members: by typing, pasting, inserting, or **Add tasks…**, which picks board tasks to add as linked rows. A sheet never adds rows by itself when tasks are created on the board.
- **FR-045**: Every new string MUST be in English and Arabic. The link dialog, the preview and the badges MUST work in Arabic and on a 390 px phone, with 44 px targets, and with no serious or critical axe issues.

### Key Entities

- **Task link (per row)**: a sheet row's link to one board task, set from the Task column. One task may be linked from many rows and many sheets.
- **Column mapping**: on a sheet, which column is the Task column, and which columns stand for which task fields. Each field is mapped to at most one column per sheet.
- **Board task**: the existing task (title, stage, dates, people, links, pillar and theme, the team's own column values). It is the single source of truth for mapped cells.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member links a 50-row sheet to its tasks and maps 4 columns in under 2 minutes, without help.
- **SC-002**: An edit in a mapped cell shows on the board within 2 seconds. A change on the board shows in the open sheet within the Content sheet's refresh time.
- **SC-003**: 100% of refused edits (permissions, move rules, bad values) are reported, and no task changes because of a refused cell.
- **SC-004**: Linking 2,000 rows finishes and reports in under 5 seconds, and scrolling the linked sheet stays as smooth as an unlinked one (arrow keys under 100 ms).
- **SC-005**: No task is ever deleted or changed by deleting rows, columns or sheets (checked across every sheet action).
- **SC-006**: Teams stop copying the same plan into the Content sheet: after a month, most monthly plans that started in blank sheets are linked rather than pasted.

## Assumptions

- Option B was chosen over a one-off import (A) or task-filtered views (C). A sheet's rows are the member's own, and only chosen columns follow the board.
- Anyone who may edit the sheet may set up or change the link and mapping. Protection limits this as it limits edits.
- Task links are the board's existing task URLs. Titles are matched exactly, ignoring case and surrounding spaces.
- The refresh time for board changes is the same as the Content sheet's today. Live push is not part of this spec.
- Spec 015 stage 3 (sort and filter) treats mapped cells like other cells. Sorting by a mapped column sorts by its displayed value.
- Files (attachments) and descriptions are not mappable in this spec. They are opened from the task marker.
- The Content and Video sheets are unchanged.
