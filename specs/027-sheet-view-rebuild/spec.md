# Feature Specification: Sheet view rebuild

**Feature Branch**: `claude/wonderful-dirac-k1wflu` (no branch of its own; the work stays on the current branch)

**Created**: 2026-11-25

**Status**: Draft

**Input**: User description: the owner's final prompt of 25 Nov 2026, "Rebuild the Sheet view of Spaces", with the reference prototype https://claude.ai/artifact/MYE21kyT4C1JFpea9dGPk9#play-Views ("Space views"). No data may be lost: follow the data protection rules from the merge prompt (backup, before/after counts, dry run on a copy, report first, nothing deleted).

## Clarifications

### Session 2026-11-25

Defaults proposed to the owner on 25 Nov 2026 and used unless the owner says otherwise:

- Q: Does My tasks keep a Sheet? → A: Yes, as it is today (its Tasks tab and the person's own blank tabs). This rebuild covers Spaces, Space › Brand folders and Brand pages.
- Q: A Brand page spans Spaces. What is its Board tab, and where does a new linked row go? → A: Its Board tab shows the brand's tasks from every Space. A new row in a linked tab there asks which Space the task goes to.
- Q: Where do tasks with no theme go in the Board tab? → A: In a "No theme" group at the end.
- Q: What does removing a row in the Board tab offer, since the tab shows every task? → A: Only "Archive the task". "Remove from this tab only" is for other linked tabs.
- Q: Are there filtered tabs? → A: No. Linked tabs and "+ Add existing task" replace them.
- Q: Is "Mine / Everyone" shared between the Board view and the sheet's Board tab? → A: Yes, one choice per person per page: changing it in one changes the other.
- Q: What does a view tab's "…" menu hold? → A: Rename, Duplicate, Set as default, Delete, and also Pin and Hide (kept from today).
- Q: Who adds, links, unlinks and deletes sheet tabs? → A: Anyone with access to the Space adds tabs. Linking, unlinking and deleting a tab is for the person who made it, admins and superusers.
- Q: Video clips are their own tasks today. Are they subtasks? → A: Clips show as child rows of their video and stay their own tasks. No data changes for them.
- Q: Does a theme in an unlinked tab create a project? → A: Revised 25 Nov 2026 during planning, to follow the owner's prompt literally (§5: "Theme … mapped to a project"): a theme in any tab is a project, picked from the existing ones or created by an admin or superuser, as in the Board tab. (The earlier default, plain labels in unlinked tabs, would have needed a second grouping system.)
- Q: What about old Sheets tabs with no matching Space? → A: They are listed in the conversion report, and the owner says where each goes before anything moves.
- Q: Which data does the conversion's dry run use? → A: A fresh backup of live, taken just before; yesterday's backup is out of date.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open the right view straight away (Priority: P1)

A team member opens a Space and switches between Board, Sheet and Calendar. Each opens at once, on its own address, from a click, a link or a refresh. The Board's layout toggle switches between cards and a compact list of the same board and never opens the sheet. "+ View" adds a named view of any type with its own fields, sort and filters, and each view tab has a menu to rename, duplicate, set as default or delete it.

**Why this priority**: The Sheet tab used to stay on "Opening the sheet…", and the sheet could only be reached through the Board's layout toggle. Every other story needs the views to open reliably and separately.

**Independent Test**: Click Sheet, refresh on it, open its link in a new tab; switch the Board between Cards and List; add, rename, duplicate and delete a view.

**Acceptance Scenarios**:

1. **Given** the Content Space's Board, **When** the person clicks "Sheet", **Then** the sheet opens on its Board tab, never staying on a loading message.
2. **Given** the address of the Sheet tab, **When** the page is refreshed or the address is opened in a new tab, **Then** the sheet opens directly.
3. **Given** the sheet takes longer than 10 seconds to load, **When** the time passes, **Then** the view shows an error with "Try again" and the cause is recorded.
4. **Given** the Board view, **When** the person switches its layout between Cards and List, **Then** the same board shows as cards or as a compact list, and the sheet never opens.
5. **Given** "+ View", **When** the person adds a view of type Board, Sheet, Calendar or List with a name, **Then** it appears as a tab with its own address, fields, sort and filters.
6. **Given** a view tab's "…" menu, **When** the person chooses Rename, Duplicate, Set as default or Delete, **Then** it does so; Board, Sheet and Calendar offer no Delete.
7. **Given** a person last used the Sheet in Content › Forefront, **When** they open that folder again, **Then** it opens on the Sheet.

---

### User Story 2 - The Board tab mirrors the board (Priority: P1)

In the Sheet view, the first tab is always "Board". It shows every task on this Space's board, grouped Theme › Pillar, with the same filter bar as the Board view, so both always show the same tasks. Changes in either place show in the other.

**Why this priority**: It is the core promise of the rebuild: one list of tasks, seen as a board or as a sheet.

**Independent Test**: Filter "Mine" on the Board; open the Sheet's Board tab and compare. Move a task's stage on the board and see it in the tab, and the reverse.

**Acceptance Scenarios**:

1. **Given** "Mine" chosen on the Board view, **When** the person opens the Sheet's Board tab, **Then** it shows exactly the same tasks.
2. **Given** a task moved to another stage on the board, **When** the Board tab is open, **Then** its Status changes there; changing Status in the tab moves the card on the board.
3. **Given** tasks with no theme, **When** the Board tab is shown, **Then** they sit in a "No theme" group at the end.
4. **Given** the Board tab, **When** the person opens its menu, **Then** it says "The Board tab is always linked" instead of Link/Unlink, and the tab can't be moved or deleted.
5. **Given** the Board tab, **When** the person shows, hides or reorders its columns, **Then** the change is kept for them.
6. **Given** a Space › Brand folder, **When** its Board tab is shown, **Then** it holds that brand's tasks only, and a task created there gets that brand.
7. **Given** a Brand page, **When** its Board tab is shown, **Then** it holds the brand's tasks from every Space.

---

### User Story 3 - Linked and unlinked tabs (Priority: P2)

A person adds tabs with "+". A new tab is a plain spreadsheet (unlinked). Right-clicking a tab (or its "⋯") links it to the board: every titled row becomes a task on this Space's board, with the columns matched to task fields first and a count shown before anything is created. Unlinking keeps the tasks on the board and the rows in the tab; linking again reconnects the same rows to the same tasks. In an unlinked tab, any single titled row can become a task with "Make task".

**Why this priority**: It lets the team plan in a sheet and turn the plan into board tasks without copying, and it is the riskiest part for duplicates, so it must be exact.

**Independent Test**: Add a tab, type three rows (one untitled), link it, check the board; unlink and link again and check no duplicates; in another unlinked tab, "Make task" on one row, then link the tab.

**Acceptance Scenarios**:

1. **Given** "+" next to the tabs, **When** the person clicks it, **Then** a new unlinked tab opens, blank, and the Board tab is unchanged.
2. **Given** an unlinked tab with titled and untitled rows, **When** the person chooses "Link to board", **Then** they see each column matched to a task field by name (Title → Title, Brand → Brand, Status → Status), can change any match or mark it "Sheet only", and see "This will create N tasks on the [Space] board" before confirming.
3. **Given** the link confirmed, **When** it finishes, **Then** N tasks appear on the board in the first stage (To Do), and the untitled rows stay plain rows and are listed.
4. **Given** a linked tab, **When** the person adds a row with "+ Row" and gives it a title, **Then** a task is created on the board.
5. **Given** a linked tab, **When** the person chooses "+ Add existing task", **Then** they can add tasks already on the board; a task can be in several linked tabs and is the same task in each.
6. **Given** a linked row, **When** the person removes it, **Then** they are asked "Remove from this tab only" (the task stays on the board) or "Archive the task".
7. **Given** a linked tab, **When** the person unlinks it, **Then** the tasks stay on the board unchanged and the rows stay as plain rows with their last values.
8. **Given** a tab that was unlinked, **When** it is linked again, **Then** it says "Reconnects N rows to their tasks. No duplicates." and creates tasks only for rows that never had one.
9. **Given** an unlinked tab, **When** the person chooses "Make task" on one titled row, **Then** one task is created with the row's values (matched by column name) and the row becomes a linked row whose Task cell shows the task's name as a link with its Space and stage; the other rows stay plain.
10. **Given** a linked row in an unlinked tab, **When** the person chooses "Unlink row", **Then** the task stays on the board and the row keeps its last values as plain text.
11. **Given** an unlinked tab where one row was already made a task, **When** the tab is linked, **Then** that row is reconnected, not duplicated, and only the remaining titled rows become new tasks.
12. **Given** the Content › Forefront folder, **When** a linked tab or a "Make task" row there creates a task, **Then** the task's Brand is Forefront.
13. **Given** a tab's menu, **When** the person chooses Delete, **Then** they are asked first; the tab and its plain rows are removed and its linked tasks stay on the board.

---

### User Story 4 - Themes, pillars and child rows (Priority: P2)

Inside a tab, rows sit under Theme groups (each mapped to a project) and Pillar sub-groups, and a row can have child rows one level down. In a linked tab, where a row sits decides its task's theme and pillar, and a child row is a subtask.

**Why this priority**: It is how the team plans content today; the rebuild must keep it and make it direct.

**Independent Test**: Add a theme from an existing project, add a pillar, add rows and a child row in a linked tab, drag a row to another pillar, and check the tasks' theme, pillar and subtask.

**Acceptance Scenarios**:

1. **Given** an admin or superuser, **When** they choose "+ Theme" or "Insert theme above / below", **Then** they pick an existing project or create one (name, owner, frequency, audience), and the theme row shows the project's owner, frequency and audience in its tooltip.
2. **Given** a theme's menu, **When** an admin, superuser or the theme's owner chooses "+ Pillar", **Then** a pillar with that name is added to the theme's project.
3. **Given** the "+ Row" line at the end of a theme or pillar, **When** the person types a row and presses Enter, **Then** the row is added there and the next row is ready.
4. **Given** a linked tab, **When** a plan is pasted on a theme, pillar or "+ Row" line, **Then** the rows are added there and become tasks.
5. **Given** a row, **When** the person presses Tab or chooses "Add child row", **Then** it becomes (or gets) a child row one level down; Shift+Tab moves it back out.
6. **Given** a linked row, **When** it is dragged onto another theme or pillar, **Then** its task's theme or pillar changes; dropped onto a row (not between rows), it becomes that row's child, a subtask.
7. **Given** themes and pillars dragged into a new order, **When** done, **Then** only this sheet's order changes, not the projects.
8. **Given** a theme or pillar being deleted, **When** the person confirms, **Then** they choose where its rows go; no row is deleted with its group and the project stays.
9. **Given** a parent row being deleted, **When** the person confirms, **Then** they choose whether its child rows move up a level or are deleted with it.

---

### User Story 5 - Columns per tab and person (Priority: P3)

Each tab shows Standard fields, the custom fields on in this Space, and sheet-only columns. Each person keeps their own shown columns, order, widths, sort, grouping and collapsed groups per tab, and "+" at the end of the headings opens the Add column panel.

**Why this priority**: The field system already exists; this applies it per tab.

**Independent Test**: In one tab hide a column and widen another as one person; sign in as another person and see the tab unchanged; add a column with "+".

**Acceptance Scenarios**:

1. **Given** a linked row, **When** a standard or custom column is edited, **Then** the task's field changes; a sheet-only column never touches the task.
2. **Given** one person hiding, moving or resizing a column in a tab, **When** another person opens the same tab, **Then** they see their own layout.
3. **Given** "+" at the end of the headings, **When** clicked, **Then** the Add column panel opens.

---

### User Story 6 - Convert the existing sheets without loss (Priority: P1 for the release)

The Content sheet becomes the Content Space's Board tab and the Video sheet the Video Space's Board tab, with their themes and pillars as groups mapped to their projects and every piece, video and clip still linked to its task. Blank tabs from the old Sheets section become unlinked tabs in the matching Space. A report lists every tab and where it went, with before and after counts. Nothing is deleted.

**Why this priority**: Live data depends on it. It runs once, after the views and tabs work.

**Independent Test**: Run the conversion on a copy of a fresh live backup, read the report, compare the counts, and open each converted tab.

**Acceptance Scenarios**:

1. **Given** a fresh backup restored to a copy, **When** the conversion runs as a dry run, **Then** a report lists every tab and its destination, and before/after counts for tasks, rows, columns, values, formats and comments match.
2. **Given** an old tab with no matching Space, **When** the report is produced, **Then** it is listed and not moved until the owner decides.
3. **Given** the conversion approved and applied, **When** the Content Space's Sheet opens, **Then** its Board tab shows the former Content sheet's themes, pillars, rows, custom columns, values, formatting and comments.

---

### Edge Cases

- A task removed from the board (archived) while it is a row in a linked tab: the row shows it as archived and offers Restore; it is not deleted from the tab.
- A task deleted elsewhere while linked in a tab: the row keeps its last values as a plain row and says the task is gone.
- Linking a tab with a column whose name matches no field: it defaults to "Sheet only".
- Two people linking the same tab at once: the second sees that it is already linked; no row gets two tasks.
- A row's Brand column holds a brand name that doesn't exist: the match screen flags it; the task is created without that brand only if the person confirms.
- A pasted plan larger than 200 rows: it is refused with a message, nothing is half-added.
- A child row under a plain row in a linked tab, when the parent gets a title and becomes a task: the child becomes its subtask.
- Deleting the only theme in a tab: its rows move to the theme the person chooses or to "No theme".
- An unlinked tab in a Space › Brand folder, linked later: its tasks get the folder's brand.
- A person without access to the Space opening a tab's address: they are refused, and no rows are shown.
- The Board tab in a Space with thousands of tasks: it stays responsive (rows are drawn as they scroll into view).

## Requirements *(mandatory)*

### Functional Requirements

**Views (§1)**

- **FR-001**: Each Space, Space › Brand folder and Brand page MUST show view tabs Board · Sheet · Calendar · + View, each with its own address that opens that view directly from a click, a link or a refresh.
- **FR-002**: A view MUST NOT stay on a loading message: after 10 seconds it MUST show an error with "Try again" and record the cause.
- **FR-003**: The Board view's layout toggle MUST switch between Cards and a compact List of the same board, and MUST NOT open the sheet.
- **FR-004**: "+ View" MUST add a named view of type Board, Sheet, Calendar or List, with its own fields, sort and filters.
- **FR-005**: A view tab's "…" menu MUST offer Rename, Duplicate, Set as default, Delete, Pin and Hide; Board, Sheet and Calendar MUST NOT offer Delete.
- **FR-006**: The page MUST open on the view each person used last, per Space and per folder.

**Where sheets live (§2)**

- **FR-007**: Sheets MUST exist only as the Sheet view of a Space, a Space › Brand folder or a Brand page (and My tasks, unchanged); there MUST be no separate Sheets section.
- **FR-008**: A task created from a Space › Brand folder's sheet MUST get that folder's brand.

**The workbook and the Board tab (§3)**

- **FR-009**: The Sheet view MUST be a workbook with tabs along the bottom, the "Board" tab always first.
- **FR-010**: The Board tab MUST be linked, MUST show every task on the board (a folder: its brand's; a Brand page: the brand's from every Space) grouped Theme › Pillar with a "No theme" group last, and MUST use the Board view's filter bar with the same choices, so both show the same tasks.
- **FR-011**: The Board tab MUST NOT be unlinked, moved or deleted; its columns MUST be shown, hidden and reordered like any tab's.
- **FR-012**: "+" next to the tabs MUST add a new unlinked tab.

**Linking (§4)**

- **FR-013**: A tab's menu (right-click or "⋯") MUST offer Link to board / Unlink from board, Rename, Duplicate and Delete; the Board tab's menu MUST say "The Board tab is always linked" instead of Link/Unlink.
- **FR-014**: A linked tab MUST show a link icon on its name; every titled row in it MUST be a task on this Space's board, and a new titled row MUST create one.
- **FR-015**: A linked tab MUST offer "+ Add existing task"; a task MUST be able to appear in several linked tabs and MUST be the same task in each.
- **FR-016**: Edits to a linked row MUST show on the board and in the task panel, and the reverse, without a reload.
- **FR-017**: Removing a linked row MUST ask "Remove from this tab only" or "Archive the task" (the Board tab: only "Archive the task").
- **FR-018**: An untitled row in a linked tab MUST stay a plain row until it gets a title.
- **FR-019**: In an unlinked tab, each titled row MUST offer "Make task", which creates one task on this Space's board from the row's values matched by column name and turns the row into a linked row whose Task cell shows the task's name as a link with its Space and stage.
- **FR-020**: A linked row MUST offer "Unlink row", which keeps the task on the board and the row's last values as plain text.
- **FR-021**: Linking a tab with rows MUST first show each column matched to a task field by name, allow changing each match or marking it "Sheet only", and show "This will create N tasks on the [Space] board" (and "Reconnects N rows" when some rows had tasks) before creating anything; untitled rows MUST be listed and stay plain.
- **FR-022**: Unlinking a tab MUST leave its tasks on the board unchanged and its rows as plain rows with their last values, and the tab MUST remember each row's task.
- **FR-023**: Linking a tab again, or linking a tab with rows made tasks one by one, MUST reconnect those rows to their tasks and create tasks only for rows that never had one: no duplicates.
- **FR-024**: Deleting a tab MUST ask first; it MUST remove the tab and its plain rows only, and its linked tasks MUST stay on the board.
- **FR-025**: Anyone with access to the Space MUST be able to add tabs; linking, unlinking and deleting a tab MUST be limited to the tab's creator, admins and superusers, enforced on the server.

**Structure (§5)**

- **FR-026**: A tab MUST group rows as Theme › Pillar › Row › Child row (one level of children); theme and pillar groups MUST be merged across the row and collapsible.
- **FR-027**: A theme row MUST show its project's owner, frequency and audience in its tooltip.
- **FR-028**: A linked row MUST take its task's theme and pillar from the groups it sits under, and moving it MUST change them; a child row under a linked row MUST be a subtask of that row's task.
- **FR-029**: "+ Theme" and "Insert theme above / below" MUST let admins and superusers pick an existing project or create one (name, owner, frequency, audience).
- **FR-030**: "+ Pillar" in a theme's menu MUST add a named pillar to the theme's project, for admins, superusers and the theme's owner.
- **FR-031**: Each theme and pillar MUST end with a "+ Row" line (Enter adds the next row); rows MUST also be added with "Insert row above / below" and by pasting a plan on a theme, pillar or "+ Row" line (in a linked tab they become tasks); anyone with access to the Space can add rows.
- **FR-032**: A child row MUST be added with "Add child row" or Tab, and moved back out with Shift+Tab, by anyone who can edit the parent row.
- **FR-033**: Dragging a row onto a theme or pillar MUST move it there; dropping it onto a row MUST make it that row's child.
- **FR-034**: Dragging themes and pillars MUST reorder this sheet only, not the projects.
- **FR-035**: Deleting a theme or pillar MUST ask where its rows go; rows MUST NOT be deleted with their group, and the project MUST stay.
- **FR-036**: Deleting a parent row MUST ask whether its child rows move up a level or are deleted with it.
- **FR-037**: In every tab (linked or not), a theme MUST be a project and a pillar one of its pillars, picked or created as in FR-029 and FR-030.
- **FR-038**: Video clips MUST show as child rows of their video and stay their own tasks.

**Columns (§6)**

- **FR-039**: Columns MUST follow the unified field system: Standard fields, custom fields on in this Space, and sheet-only columns; for linked rows, standard and custom columns MUST be the task's fields.
- **FR-040**: Each tab MUST keep, per person, its shown columns, order, widths, sort, grouping and collapsed groups.
- **FR-041**: "+" at the end of the headings MUST open the Add column panel.

**Conversion (§7)**

- **FR-042**: A one-time conversion MUST turn the Content sheet into the Content Space's Board tab and the Video sheet into the Video Space's Board tab, with themes and pillars as groups mapped to their projects and every piece, video and clip still linked to its task.
- **FR-043**: Blank tabs from the old Sheets section MUST become unlinked tabs in the matching Space with their rows as plain rows; tabs with no matching Space MUST be listed and wait for the owner's decision.
- **FR-044**: Custom columns, values, formatting and comments MUST carry over.
- **FR-045**: The conversion MUST run first as a dry run on a copy of a fresh live backup, produce a report (every tab and where it went, before/after counts), and apply only after the owner approves; nothing MUST be deleted.

**General**

- **FR-046**: Everything new MUST be in English and Arabic, with right-to-left layout in Arabic.
- **FR-047**: Every rule that limits who may do something MUST be enforced on the server, not only hidden in the interface.

### Key Entities

- **View**: a tab across the top of a page (Board, Sheet, Calendar, List), built-in or saved; has a type, name, owner (personal or shared), fields, sort and filters.
- **Workbook**: the Sheet view of one page (Space, Space › Brand folder, Brand page, My tasks); holds its sheet tabs in order.
- **Sheet tab**: one tab of a workbook; Board (always linked, first) or added; linked or unlinked; has a creator.
- **Row**: a line in a tab; plain or linked; may sit under a theme and pillar; may be a child of another row; a linked row points to a task, and an unlinked tab remembers the task a row had.
- **Theme group / Pillar group**: the groups in a tab: a project placed on the tab, and one of its pillars.
- **Column**: a standard field, a custom field or a sheet-only column; its layout is kept per person and per tab.
- **Conversion report**: every old tab, its destination, and before/after counts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The Sheet view opens within 2 seconds on a normal connection, from a click, a link or a refresh, and never stays on a loading message for more than 10 seconds.
- **SC-002**: With the same filter, the Board view and the sheet's Board tab list exactly the same tasks, 100% of the time.
- **SC-003**: A stage, title or field changed in one place (board, sheet, task panel) shows in the others within 5 seconds without a reload.
- **SC-004**: Linking, unlinking and relinking a tab any number of times never creates a duplicate task: tasks created = titled rows that never had a task.
- **SC-005**: After the conversion, before and after counts match exactly for tasks, rows, columns, values, formats and comments, and the report lists every old tab.
- **SC-006**: A team member can plan a theme with 10 rows in an unlinked tab and turn it into tasks on the board in under 2 minutes.
- **SC-007**: Every check the owner listed (§8) passes in English and in Arabic.

## Assumptions

- The Sheet tab loading bug is already fixed on the branch, with the 10-second error and "Try again"; this spec keeps both as requirements.
- The unified field system (Standard, Custom, Regular; Add column panel; per-person columns) is already built and is reused, not rebuilt.
- The existing rows model (themes, pillars, plain and linked rows, "Make task") is the starting point; linked and unlinked tabs extend it rather than replace it.
- "First stage" for new tasks is the board's first stage in that Space (To Do in Content).
- The prototype at the address above is the reference for layout and wording; where it and this spec differ, the owner's written prompt wins.
- The conversion is a one-time step run during release, after the views and tabs are tested on staging.
- Work happens on the current branch and is pushed there; nothing goes to main without the owner's approval.

## Changed on 25–26 Nov 2026 (owner, release QA review)

Decisions from the owner's answers to the QA review (fixes F01–F31). They replace anything above that says otherwise. Ids are `FR-QA-nn`, shared across specs 022, 024, 026 and 027.

- **FR-QA-01** (F17, F18, F21) There are no parent tasks, subtasks or child rows. The structure is Theme › Pillar › Task; not every task has a pillar. Rows nested before show flat; their stored link is kept, not deleted. Moving or dropping a row never nests it. Deleting a row that still has rows under it from before moves them up a level unless told otherwise.
- **FR-QA-02** (F03, F21) A clip is not a separate kind of thing: it is another name for a Video task, with the same Theme › Pillar › Task structure. A task that shows in several Spaces is one task, not linked copies; in each Space it shows with its theme, pillar and all its details.
- **FR-QA-03** (F17) The 'Video' and 'Linked task' columns made on 25 Nov to hold old parents are hidden, not deleted, after their values are recorded in the export `subtasks-parents.csv`.
- **FR-QA-07** (F27, F29) Make task offers only Spaces the person may add to, with none chosen in advance. A spreadsheet tab (not converted to rows, so its formatting and merged cells stay) offers Make task on titled rows with no task, only when the tab uses the Link task column.
- **FR-QA-08** (F19, F28) Adding a theme may pick an existing theme from any Space; a name that already exists reuses it. A brand board's sheet hides + Theme where a theme can't be added.
- **FR-QA-09** (F23) Paste plan reads a Date column (day first: 24/11/2026). With no heading row the first column is the title and other columns are read by what they hold; a plain list is one column only.
- **FR-QA-10** (F07, F09) Edits made offline wait, say so, and save when the connection is back. An edit made on an older copy is refused ("Someone changed this a moment ago…") instead of overwriting the newer change.
- **FR-QA-13** (F12, F13) Mine / Everyone is one switch per page, shared by its Board, List, Calendar and Sheet views. The board can group by brand, and filters by brand when it holds two or more.
- **FR-QA-12** (F10, F11, F14, F20) Sign-in pauses after 5 wrong passwords per address or 20 per network in 15 minutes. Reset links use APP_URL, which must be set in production. Arabic search ignores ال and its joined forms. Text greys meet 4.5:1 contrast; a Skip to content link comes first; touch targets are 44px on touch screens.
- **FR-QA-15** (F31) Checks: `npm run lab:qa` (pure rules) and `scripts/spaces-lab/realapp/scenarios-qa.cjs` (in the app).

- Not changed yet: F22 (the "Videos · No brand" theme's name) waits for the owner. F24 (a hydration warning) could not be reproduced in 6 fresh loads.
