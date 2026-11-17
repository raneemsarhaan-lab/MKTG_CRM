# Feature Specification: Task Fields in Every Sheet (ClickUp Style)

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-17 (revised the same day)

**Status**: Draft (design awaiting approval)

**Input**:
- User description: "why when I connect any sheet manually, it doesn't show like the one we connect hard code?"
- Then: "lets do something more professional, as clickup we have fields that are already linked, and we can add them from the sheet setting, and we always have extra regular columns as regular excel sheet".

**Design**: [design/task-fields.html](../../design/task-fields.html). An earlier take, [design/linked-cells.html](../../design/linked-cells.html), was set aside.

## Clarifications

### Session 2026-11-17

- **Q: Which rows are tasks?**
  A: As in linked sheets today. A row is a task only when it is linked to one, through the task column. Every other row is an ordinary row.
- **Q: What happens to today's column mapping (TSC Calendar)?**
  A: **Keep both.** Mapping an existing column stays possible: "Use this column for a task field".
- **Q: Content and Video sheets?**
  A: **Same model.** They become sheets with a preset row source (the board's content or video tasks, grouped by theme and pillar), the same Fields drawer, field columns and regular columns.

## Context

Today a team-linked sheet maps columns to fields, and those cells show plain text. The Content sheet shows real controls, but its columns are fixed by code.

ClickUp's table view is the model people expect:

- The fields belong to the task, and you add them from "＋" or from the view's settings.
- They show and edit with their own controls.
- Regular columns sit beside them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add task fields from the sheet (Priority: P1)

A member clicks ＋ at the end of the headings, or opens **⚙ Fields**. They switch on Stage, Assignee, Due date and Design link. Each one appears as a column with a purple field heading:

- **Rows with a task** show the field's control: status pill, avatar, date, link label.
- **Rows without a task** leave the cell empty.

**Independent Test**: In a sheet whose Topic column holds task links, add Stage, Assignee, Due date and Design link from ＋. Each linked row shows the task's values. Switch Assignee off: the column goes away, and the task keeps its assignee.

**Acceptance Scenarios**:

1. **Given** ＋ is clicked, **When** a task field is picked, **Then** a field column is added at the end, filled for linked rows.
2. **Given** the Fields drawer, **When** a field's switch is turned off, **Then** its column is removed from the sheet, and nothing changes on the task.
3. **Given** the drawer, **When** the member drags a field, **Then** its column moves to match.
4. **Given** the available fields, **Then** they are Stage, Assignee, Owner, Due date, Priority, Platform, Content type, Theme, Pillar, Working doc, Design link, Post link, Published link, and the team's own Content columns.

### User Story 2 - Edit fields with their controls (Priority: P1)

A field cell on a linked row opens its control: the stage menu (stages the member doesn't hold are disabled), the people picker, type, pillar, priority, the date picker, or a link field. Saving follows the board's rules, and undo reverts it.

**Independent Test**: Change stage, assignee, type, pillar, due date and design link from the sheet. Each shows on the board. Each undoes in one step.

### User Story 3 - Regular columns stay a spreadsheet (Priority: P1)

Regular columns have grey headings and are ordinary cells. They keep every spreadsheet tool (formatting, merges, sort and filter, comments, several areas). ＋ → "Spreadsheet column" adds one. "Use this column for a task field" turns a regular column into a field column, as today's mapping does. "Turn into a regular column" goes back, keeping the shown text.

**Independent Test**: Add a "Notes" regular column, type in it, format it and sort by it. Turn "Owner" (a text column) into the Assignee field: linked rows show avatars, and unlinked rows keep their text.

### User Story 4 - Rows link to tasks (Priority: P1)

The drawer names the **task column**. Rows whose task cell holds a task link or a task's name are linked:

- A linked row shows ↗ and "Open ↗".
- An unlinked row with text shows "Link a task". It searches tasks, or offers "＋ Create a task" with that name.

### User Story 5 - Content and Video sheets use the same model (Priority: P2)

The Content sheet's columns become field columns (Type, Stage, Assignee, Working doc…) and regular columns (today's custom columns, if they are text). Its rows are still every content task, grouped by Theme › Pillar. The drawer shows this at the top as **Rows: Content tasks from the board**, with a Group by choice. Columns, Mine, Show archived and Paste plan stay; Columns opens the same Fields drawer. The Video sheet works the same way.

**Independent Test**: On the Content sheet, open ⚙ Fields, switch on Due date and switch off Working doc. The columns change, and the grouping and counts stay. Reload: the choice is kept for the sheet.

### Edge Cases

- **Sheets mapped with spec 016 (TSC Calendar)** open with their mapped columns shown as field columns. Nothing has to be redone.
- **Merges, frozen panes and formats** on field columns keep working. A field cell's own formatting (fill, bold) applies around its control.
- **Arabic**: headings, drawer and controls mirror.
- **Phones**: the drawer is a bottom sheet, and the controls are the Content sheet's phone versions.
- **Permissions**: field cells follow the task's rules. Regular cells follow the sheet's protection.

## Requirements *(mandatory)*

- **FR-001**: Every sheet MUST have a Fields drawer (⚙ Fields; also Data › Task fields) that:
  - names the task column, or the preset row source;
  - lists every task field with an on/off switch and drag to reorder;
  - lists the regular columns, with "＋ Add a regular column".
- **FR-002**: The last heading MUST be ＋. It opens a searchable picker of the task fields not yet shown, plus "Spreadsheet column".
- **FR-003**: Field columns MUST have a distinct heading (field icon, purple), and their cells MUST use the Content sheet's controls on linked rows. On unlinked rows the cells are empty and can't be typed into.
- **FR-004**: A column's heading menu MUST offer:
  - for a field column: Hide field, and Turn into a regular column;
  - for a regular column: Use this column for a task field ▸, Rename, and Delete.
- **FR-005**: Field edits MUST save through the existing task write path (`writeTaskFields` and the board's actions). The same permissions, stage rules and celebrations setting apply, with one undo step each. Typing, paste, fill and replace into field cells keep working.
- **FR-006**: Spec 016 mappings MUST load as field columns with no data loss. The task column and row links are unchanged.
- **FR-007**: The Content and Video sheets MUST render through the same field-column model. Their row source, grouping, counts and buttons stay as today. Their column set (shown fields, order, widths, custom columns) MUST be kept per sheet.
- **FR-008**: English and Arabic, keyboard reachable, and axe-clean.

## Success Criteria *(mandatory)*

- **SC-001**: A member adds four task fields to a sheet in under 20 seconds, without help.
- **SC-002**: The same field (e.g. Stage) looks and edits identically in a team sheet and on the Content sheet.
- **SC-003**: Every spec 009/010/013–018 lab check passes, after selector updates where needed.
- **SC-004**: The Content sheet with 500 tasks opens and scrolls as fast as today.

## Assumptions

- No new task fields are added to the board; the list is today's `TASK_FIELDS` plus the team's Content columns.
- Regular columns stay plain spreadsheet cells. Typed regular columns (dropdown, date, checkbox) are a later step, if wanted.
- This is a large change. It will be built in stages:
  1. team sheets: the drawer, ＋, field columns and controls;
  2. the Content sheet;
  3. the Video sheet.
