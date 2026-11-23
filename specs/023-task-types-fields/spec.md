# Feature Specification: Task Types and Fields

**Feature Branch**: `claude/wonderful-dirac-k1wflu`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "Task types and fields (ClickUp task model), per the approved review page `design/task-fields-methodology.html` and the user's decisions of 2026-11-23 (D1–D18, Milestone as a calendar marker, dates only)."

**Approved methodology**: https://claude.ai/artifact/QxTcDgmJgxEdJke4L9n46r (`design/task-fields-methodology.html`, decisions recorded).

**Depends on**: spec 022 (task methodology) shipped and tested before Stage A starts.

**Stages**: A (task types, fields, statuses, milestones) → B (priorities, tags, assignees) → C (start dates) → D (templates, recurring tasks). Each stage is reviewed before the next starts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Task types (Priority: P1, Stage A)

An admin opens Settings › Task types and sees today's content types (Post, Carousel, Story, Reel, Video…) as task types. Each has an English and Arabic name, an icon and a colour, and already keeps its SLA days and its media boards. The admin sets a type's default priority and default tags, and later (Stage D) its default template. A member creating a task picks its type; the type's icon and colour show on cards, rows and the task panel.

**Why this priority**: every later point (fields, defaults, templates, recurring tasks) hangs on the task type.

**Independent Test**: rename "Reel" in Arabic, give it an icon and colour, set its default priority to High; create a Reel task and see the icon, colour and High priority; existing Reel tasks keep their SLA and Video board.

**Acceptance Scenarios**:

1. **Given** the existing content types, **When** Stage A ships, **Then** each appears as a task type with its SLA and media boards unchanged and every existing task keeps its type.
2. **Given** a type with a default priority and default tags, **When** a task of that type is created without choosing them, **Then** it gets those defaults.
3. **Given** a user (not an admin or superuser), **When** they open Settings › Task types, **Then** they can read the types but not change them.

---

### User Story 2 - Custom fields by task type (Priority: P1, Stage A)

An admin or superuser creates a field in Settings › Fields (for example "Caption", text; "Budget", money; "Channels", multi-choice) and attaches it to task types, marking it optional or "Required from stage" (for example, Caption required before C-Review). The field's value belongs to the task: it shows in the task panel, as a column in every sheet the task appears in, and in filters, sorts and group-by; the admin can choose to show it on cards. When someone tries to move a Reel past C-Check with no Caption, the move is refused with "Caption is required before C-Review".

**Why this priority**: today a custom column lives on one sheet; teams retype the same information in each sheet.

**Independent Test**: attach "Caption" (required before C-Review) to Post; fill it on the Content sheet and see it in the task panel and in the Planning Space's sheet; empty it and try to move the task to C-Review.

**Acceptance Scenarios**:

1. **Given** a field attached to a type, **When** a task of that type is opened anywhere, **Then** the field shows with the same value in the panel and in every sheet where the task appears.
2. **Given** a field required from a stage, **When** a move (drag, menu, typing in a sheet, bulk, or a linked task moving the row) would take the task to or past that stage while the field is empty, **Then** it is refused and the message names the field and the stage.
3. **Given** an existing sheet column with values, **When** an admin chooses "Make it a task field", **Then** a task field is created with the same name, kind and options, the column's values move onto the tasks, and the sheet shows the field in place of the column.
4. **Given** a field not attached to a task's type, **When** the task shows in a sheet that has that field as a column, **Then** the cell is shown as not applicable (hatched) and can't be typed into.

---

### User Story 3 - Statuses and milestones (Priority: P2, Stage A)

Statuses stay the pipeline, renamed or split per Space (spec 022). Reports and filters can group stages as Not started (To Do), Active (the C and D stages and F-Check), Done (Ready to Publish, Scheduled) and Closed (Published). Separately, an admin or superuser adds a **milestone** to a brand's calendar — a name and a date, such as "Ramadan campaign launch" — which shows on that brand's calendar, the Space calendars and My tasks' calendar, without being a task.

**Why this priority**: report grouping and milestones complete Stage A without changing how work moves.

**Independent Test**: add a milestone for Forefront on 1 Dec; it shows on Forefront's calendar and the Content Space calendar, can't be dragged into a stage, and has no assignee or SLA.

**Acceptance Scenarios**:

1. **Given** the status groups, **When** a list or report is grouped by status group, **Then** each task falls in the group of its pipeline stage.
2. **Given** a milestone, **When** someone opens it, **Then** they can rename it, move its date or delete it (admins and superusers), and nothing else.

---

### User Story 4 - Priorities and tags (Priority: P2, Stage B)

Priorities become Urgent, High, Normal, Low and No priority; every task that was Medium is now Normal. Urgent tasks sort first on every board, list and sheet, and making a task Urgent notifies its assignees at once. Anyone tagging a task can type a new tag name to create it; tags are coloured, many per task, and show on cards, in the panel, as a sheet column and in filters and group-by. Admins rename, merge or delete tags in Settings. A brand can switch tags off.

**Independent Test**: set a task Urgent and see it first in its column and a notification to its assignee; tag two tasks "Eid" (creating the tag), filter the board by Eid; merge "Eid" into "Eid 2026" as an admin and see both tasks carry "Eid 2026".

**Acceptance Scenarios**:

1. **Given** existing Medium tasks, **When** Stage B ships, **Then** they read Normal and nothing else about them changes.
2. **Given** an Urgent task, **When** its SLA is computed, **Then** the stage limits are the same as for any other priority.
3. **Given** two tags merged, **When** the merge is confirmed, **Then** every task with the old tag has the kept tag once, and the old tag is gone.

---

### User Story 5 - Several assignees with a lead (Priority: P2, Stage B)

A task has one owner and one or more assignees; the first is the **lead**. Everyone assigned sees the task in My tasks and is notified. The lead gets SLA alerts and is the one whose Spaces the task joins (Shows in). Changing the lead moves Shows in as spec 022 does for an assignee change. Workload splits the task's hours evenly across the assignees unless hours are set per person.

**Independent Test**: assign a task to Samaa (lead) and Noran; both see it in My tasks; it shows in Samaa's Spaces only; set Noran as lead and Samaa's Space-only rows go; workload shows half the hours each, then 6/2 after setting hours per person.

**Acceptance Scenarios**:

1. **Given** today's single assignee, **When** Stage B ships, **Then** that person is the lead and the only assignee.
2. **Given** a stage's move permission, **When** any assignee moves the task, **Then** they may move it as the assignee may today.

---

### User Story 6 - Start dates (Priority: P2, Stage C)

A task can have a start date, set by hand or by a template, never after its due date. The calendar can show tasks as spans from start to due. Workload spreads a task's hours over the working days between start and due, on the Settings weekend. Dates stay Cairo days, with no times. The due-date rule is unchanged: 7 calendar days before the publishing date, moved earlier off Friday and Saturday.

**Independent Test**: give a task a start of Sunday and a due of Thursday with 10 hours; the calendar shows a five-day span and workload shows 2 hours a day; try a start after the due date and see it refused.

**Acceptance Scenarios**:

1. **Given** a task with no start date, **When** it shows on the calendar or in workload, **Then** it behaves as today (on its day; hours on its due day).
2. **Given** a start after the due date, **When** it is saved, **Then** it is refused with a message saying the start can't be after the due date.

---

### User Story 7 - Templates (Priority: P3, Stage D)

Admins and superusers keep task templates, each for one task type. A template holds a name pattern (for example "{Brand} · Monthly recap · {Month}"), a brief, field values, priority, tags, the assignee by role, and subtasks whose dates are relative to the publishing date. Anyone creates a task from a template in "+ Task", in a sheet's new row, or on a calendar day. A task can be saved as a template. Editing a template changes only tasks created afterwards.

**Independent Test**: save a Monthly recap task as a template with two subtasks (start 10 and 5 days before publishing); create from it for 30 Dec; the task and subtasks get the right names, fields, people and dates.

**Acceptance Scenarios**:

1. **Given** a template edited after tasks were made from it, **When** those tasks are opened, **Then** they are unchanged.
2. **Given** a template whose assignee role has no member, **When** a task is created from it, **Then** the creator is assigned, as for the Space default role today.

---

### User Story 8 - Recurring tasks (Priority: P3, Stage D)

A task or template can repeat: every N days or weeks on chosen weekdays, or monthly on a day, from its publishing date, ending on a date, after a number of times, or never. The next task is created a lead time before its publishing date. The lead time defaults to the due-date offset plus the type's total SLA working days and can't be set shorter. The new task copies the type, brand, fields, tags, assignees and template subtasks, starts at To Do and gets its due date from the rule. Recurring tasks show ↻ and offer "Skip next" and "Stop repeating". In a standing project, recurring tasks count towards the project's target.

**Independent Test**: make a weekly Sunday post repeat with the default lead time; the next week's task appears on the right day with the copied fields; "Skip next" skips one week; the project's "posts this month" counts it.

**Acceptance Scenarios**:

1. **Given** a lead time shorter than the minimum, **When** it is saved, **Then** it is refused, naming the minimum in working days.
2. **Given** the scheduler was down for a day, **When** it runs again, **Then** each missed task is created once, never twice.

### Edge Cases

- A field is detached from a type while tasks hold values: the values are kept and come back if it is attached again; they don't show meanwhile.
- A field's kind is changed: values that fit the new kind are converted; those that don't are kept as text and flagged in Settings.
- Two required fields from the same stage are empty: the message names both.
- A task changes type: fields of the new type show; values of fields the new type lacks are kept, hidden.
- A tag merge or delete while someone is tagging: their next save uses the tag as it now is.
- Removing the lead leaves the next assignee as lead; removing the last assignee leaves the task with the owner as assignee, as today.
- A recurring task's brand or type is deleted: the repeat stops and the owner is notified.
- A milestone's brand is archived: the milestone hides with the brand.

## Requirements *(mandatory)*

### Functional Requirements

**Stage A — task types, fields, statuses, milestones**

- **FR-001**: Existing content types MUST become task types, keeping their SLA days and media boards; every existing task keeps its type.
- **FR-002**: A task type MUST have an English name, an Arabic name, an icon and a colour, and MAY have a default priority, default tags and (Stage D) a default template. Only admins MAY change task types.
- **FR-003**: Every task type MUST run the full pipeline; no stage skipping (D1, D2 postponed).
- **FR-004**: Admins and superusers MUST be able to create, rename and retire fields in a workspace field library, each with an English and Arabic name, a kind and, for choice kinds, options with colours.
- **FR-005**: Field kinds MUST be text, number, money, date, link, person, choice, multi-choice, checkbox, rating and related task.
- **FR-006**: Admins and superusers MUST be able to attach a field to task types; per type, a field is optional or "Required from stage" (a pipeline stage), and MAY have a default value.
- **FR-007**: A field value MUST belong to the task and show the same everywhere the task appears: task panel, every sheet (as a column), filters, sorts, group-by, and on cards when the field is set to show there.
- **FR-008**: A move that would take a task to or past a field's required stage while the field is empty MUST be refused on every path (drag, menu, sheet typing, bulk, linked-task sync, recurring creation does not apply), with a message naming the field(s) and the stage.
- **FR-009**: Existing sheet columns MUST stay as they are; an admin MAY turn one into a task field, which keeps its name, kind, options and values, and replaces the column in that sheet.
- **FR-010**: A sheet cell for a field not attached to the row's task type MUST show as not applicable and refuse input.
- **FR-011**: Statuses MUST remain the pipeline with Space stages (no free statuses); reports and filters MUST offer status groups Not started, Active, Done and Closed.
- **FR-012**: Admins and superusers MUST be able to add, rename, move and delete milestones (name, date, brand) that show on the brand's calendar, the calendars of Spaces showing that brand's work, and My tasks' calendar; a milestone is not a task.

**Stage B — priorities, tags, assignees**

- **FR-013**: Priorities MUST be Urgent, High, Normal, Low and No priority; existing Medium MUST become Normal once.
- **FR-014**: Urgent tasks MUST sort first wherever tasks are sorted by default, and setting Urgent MUST notify the assignees immediately; Urgent MUST NOT change SLA limits.
- **FR-015**: Tags MUST be one workspace list, each with a colour; a task MAY have many; anyone tagging MAY create a tag; admins MAY rename, merge and delete tags.
- **FR-016**: Tags MUST show on cards, in the task panel, as a sheet column, and in filters and group-by; a brand feature switch MUST hide them for that brand.
- **FR-017**: A task MUST have one owner and one or more assignees, the first being the lead; today's assignee MUST become the lead.
- **FR-018**: Every assignee MUST see the task in My tasks and receive assignment notifications; SLA alerts go to the lead.
- **FR-019**: Only the lead's Spaces MUST join Shows in; changing the lead MUST follow spec 022's Shows in removal rule.
- **FR-020**: Workload MUST split a task's hours evenly across its assignees unless hours are set per person.

**Stage C — start dates**

- **FR-021**: A task MAY have a start date, empty unless set by hand or by a template, never after the due date.
- **FR-022**: The calendar MUST be able to show tasks as spans from start to due.
- **FR-023**: Workload MUST spread a task's hours over the working days (Settings weekend) from start to due when both are set.
- **FR-024**: Dates MUST remain Cairo days with no times; the due-date rule MUST stay 7 calendar days before publishing, moved earlier off Friday and Saturday.

**Stage D — templates, recurring tasks**

- **FR-025**: Admins and superusers MUST be able to create, edit and delete task templates per task type: name pattern, brief, field values, priority, tags, assignee by role, and subtasks with dates relative to the publishing date.
- **FR-026**: Everyone MUST be able to create a task from a template in "+ Task", a sheet's new row and a calendar day; a task MAY be saved as a template.
- **FR-027**: Editing or deleting a template MUST NOT change tasks already made from it.
- **FR-028**: A task or template MAY carry a repeat rule: every N days or weeks on chosen weekdays, or monthly on a day of the month; ending on a date, after N times, or never; anchored on the publishing date.
- **FR-029**: The next task MUST be created a lead time before its publishing date; the lead time MUST default to, and MUST NOT be less than, the due-date offset plus the type's total SLA working days.
- **FR-030**: A created task MUST copy type, brand, project, fields, tags, assignees and template subtasks, start at To Do, and take its due date from the rule; each occurrence MUST be created exactly once.
- **FR-031**: Recurring tasks MUST show a repeat mark and offer "Skip next" and "Stop repeating".
- **FR-032**: Recurring tasks in a standing project MUST count towards the project's target.

**All stages**

- **FR-033**: Everything new MUST be in English and Arabic.
- **FR-034**: Each change to existing data (types, Medium → Normal, assignee → lead) MUST run once and record that it ran.

### Key Entities

- **Task type**: the former content type; names (EN/AR), icon, colour, SLA per stage, media boards, default priority, default tags, default template.
- **Field**: a library entry; names (EN/AR), kind, options; retired or live.
- **Type field**: a field attached to a type; optional or required from a stage; default value.
- **Field value**: a task's value for a field.
- **Milestone**: name, date, brand; not a task.
- **Tag**: name, colour; many per task.
- **Assignment**: a task's assignee, its order (first is lead), optional hours.
- **Template**: per type; name pattern, brief, values, priority, tags, assignee role, subtasks with relative dates.
- **Repeat rule**: on a task or template; frequency, weekdays or day of month, end, lead time; the occurrences already created.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A field value entered once appears in the task panel and every sheet the task is in, with no retyping (checked across 3 sheets).
- **SC-002**: 100% of moves past a required stage with an empty required field are refused, on all five move paths, with the field named.
- **SC-003**: After Stage B's change, 0 tasks read Medium and every task's previous assignee is its lead.
- **SC-004**: Creating a task from a template with 2 subtasks takes under 30 seconds and needs no further edits to names, fields, people or dates.
- **SC-005**: Over 8 weeks of a weekly repeat, exactly 8 tasks are created, each on time for its SLA, with no duplicates after a missed scheduler day.
- **SC-006**: Boards, sheets and calendars with types, fields, tags and several assignees open as fast as today (first screen under 2 seconds with 5,000 tasks).

## Assumptions

- Spec 022's pipeline, Space stages, media boards and Shows in rules stand unchanged.
- Brand feature switches (spec 021) extend to tags and to any field an admin marks switchable.
- Fields are workspace-wide; Space-specific fields are out of scope.
- Formula, progress, email and phone field kinds are out of scope.
- Gantt, dependencies and checklists are out of scope (later specs).
- Recurring creation runs on the existing scheduler (once a minute), Africa/Cairo days.
