# Feature Specification: Momentum vs ClickUp — Hierarchy, Views and Modular Features

**Feature Branch**: `claude/wonderful-dirac-k1wflu`

**Created**: 2026-11-22

**Status**: Draft

**Input**: User description: "building this CRM tool vs clickup", followed by a two-part summary of ClickUp:

- **Part 1, methodology.** The hierarchy (Workspace › Space › Folder › Subfolder › List › Task › Subtask › Checklist). Four principles: one home, many places; modular complexity (ClickApps); views separate from structure; inherited statuses. The methods it supports: Scrum, Kanban, Waterfall, OKR-led.
- **Part 2, features.** Task management, views, collaboration, planning and tracking, automation, AI, admin and integrations.

## Context

The team moved its work from ClickUp into Momentum with a one-time import. Momentum already covers much of what they used there. What it lacks is ClickUp's **organizing model**:

- Every task sits on one board, and the only grouping is by brand, project and pillar.
- Views are fixed screens (Board, Sheets, Projects, Team, Capacity). You can't open a board or a calendar on just one campaign.
- Every feature is on for everyone. A small team can't switch off what it doesn't need.

This spec brings that model to Momentum: a hierarchy, views that can be opened at any level, statuses that a Folder passes down to its Lists, and features that can be switched on per Space. It does **not** copy ClickUp's whole catalogue. The parity map below sorts each ClickUp feature into one of four groups:

- **Have**: already in Momentum;
- **This spec**;
- **Later**: its own spec, after this one;
- **Not planned**.

### Parity map

| ClickUp feature | Momentum today | Decision |
|---|---|---|
| Workspace › Space › Folder › List hierarchy | Brands, Projects, Pillars; Sheet folders | **This spec** (US1) |
| Subfolders | No | **This spec**, one extra level (US1) |
| Task › Subtask | Subtasks, video clips, project sub-steps | Have; extended in US5 |
| Checklists inside a task | No | **This spec** (US5) |
| One home, many places (task in several Lists) | No | **This spec** (US5) |
| Custom statuses, inherited from Folder | Fixed 9-stage pipeline | **This spec** (US3), within the constitution |
| ClickApps (per-Space feature switches) | No | **This spec** (US4) |
| List view | Sheets (Content, Video, team sheets) | **This spec**: as a view at any level (US2) |
| Board (Kanban) | Board | Have; becomes a view at any level (US2) |
| Table view | Sheets, with task fields (spec 019) | Have; becomes a view at any level (US2) |
| Calendar view | Due dates only, no calendar | **This spec** (US2) |
| Gantt / Timeline with dependencies, milestones, critical path | Project steps have days and milestones, no chart | **This spec** (US6) |
| Workload view | Capacity screen, Workload tab (spec 004) | Have; becomes a view at any level (US2) |
| Everything view | Board "All" scope | **This spec** (US2) |
| Activity view | Notifications and Inbox, no event log | Later (needs an event log, see HANDOVER §14) |
| Box, Map, Mind Map views | No | Not planned |
| Priorities, assignees, due dates | Yes (one assignee + owner) | Have |
| Start dates | No | **This spec** (US5) |
| Tags | No | **This spec** (US5) |
| Multiple assignees | One assignee + fixed owner | **This spec** (US5) |
| Watchers | Followers (spec 012) | Have |
| Custom fields by task type | Sheet columns, content types | **This spec** (US5) |
| Task types | Content types (Post, Video, Reel…) | Have; extended in US5 |
| Task templates | Paste plan, bulk paste | **This spec** (US5) |
| Recurring tasks | "Standing" projects only | **This spec** (US5) |
| Dependencies, relationships, links | No | **This spec** (US5) |
| Comments, threads, @mentions | Yes | Have |
| Assigned comments | No | Later |
| Docs (wikis, nested pages, Doc as a view) | Task briefs only | Later (P3 in US8, may split out) |
| Forms creating tasks | Paste plan only | Later (US9) |
| Automations (trigger › condition › action) | No | Later (US9) |
| Proofing (annotate images, PDFs, video) | Attachments with preview | Later (strong fit for Design Review) |
| Chat, Whiteboards, Clips, Meetings Hub | No | Not planned |
| Goals and Targets (OKRs) | Aspiring / Focus plan | Later (US7) |
| Dashboards with widgets | Overview, Capacity, Workload | Later (US7) |
| Time tracking, timesheets, estimates | Daily hours (spec 014), hour estimates | Have; per-task tracking Later |
| Sprints, points, burndown | No | Later (US7) |
| AI (Brain, agents, writing, summaries, standups) | No | Not planned in this spec |
| Roles Owner / Admin / Member / Guest | admin / superuser / user | Have; Guest Later |
| Private Spaces, Folders, Lists | No | **This spec** (US1) |
| Integrations, API, webhooks, Drive automations | No | Not planned in this spec |
| Desktop and mobile apps | Installable web app | Have |

## Clarifications

Open questions are marked inline as **[NEEDS CLARIFICATION]** (three in total).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organize work in a hierarchy (Priority: P1)

An admin opens the sidebar and sees the workspace tree:

- **Spaces**, such as "Forefront", "TSC", "Internal ops".
- In each Space, **Folders**, such as "Ramadan 2027 campaign". A Folder may hold one level of **Subfolders**, such as "Phase 1 · Teasers".
- In each Folder, **Lists**, such as "Social posts", "Videos", "Paid ads". A List may also sit directly in a Space, with no Folder.

The admin creates, renames, reorders, moves and archives Spaces, Folders and Lists. Every task has exactly one **home List**. Opening a node shows its tasks, including those of everything below it.

All existing work is still there after the change. The content pipeline's tasks are in Lists, grouped the same way as before, and no task is lost or duplicated.

Space mapping: **[NEEDS CLARIFICATION: What is a Space here? (a) one Space per brand, (b) one Space per team or department, with brands as a field, or (c) one Space per client group.]** This choice decides how today's brands, projects and pillars are mapped into the tree.

**Why this priority**: The hierarchy is the core of ClickUp's method. Views, inherited statuses and per-Space features all depend on it.

**Independent Test**: Create a Space, a Folder with a Subfolder, and two Lists. Move three existing tasks into one List. Open the Folder: it shows those three tasks. Open the Space: it shows them too. The Board "All" scope shows every task it showed before.

**Acceptance Scenarios**:

1. **Given** an admin, **When** they create a Space, a Folder in it, a Subfolder in the Folder and a List in the Subfolder, **Then** all four appear in the sidebar tree in that nesting.
2. **Given** a member who is not an admin, **When** they try to create a Space, **Then** they can't. Creating a Folder or List inside a Space follows the rule in FR-006.
3. **Given** a Subfolder, **When** someone tries to create a Folder inside it, **Then** it is refused: Subfolders don't nest.
4. **Given** a task in List A, **When** it is moved to List B, **Then** its home is B. Its stage, SLA clock, owner, comments and attachments are unchanged.
5. **Given** a Folder holding 12 tasks across its Lists, **When** it is archived, **Then** it and its Lists leave the tree, the 12 tasks are hidden from views, and restoring the Folder brings everything back as it was.
6. **Given** the change goes live, **When** any member opens the Board, **Then** every task they could see before is still visible, in its same stage.
7. **Given** a Space, Folder or List marked **private** with named members, **When** any other non-admin member browses or searches, **Then** they don't see it or its tasks. Admins always see everything.

---

### User Story 2 - Views at any level, separate from structure (Priority: P1)

A member opens the "Ramadan 2027" Folder and adds a **Calendar** view: every task in the Folder, by due date. They add a **Board** view grouped by stage, then a **Table** view with Assignee, Due date and Platform columns. Each view keeps its own filters, grouping, sorting and visible fields. The views show as tabs on the Folder.

The same view types can be added to a Space, a Folder, a Subfolder, a List, or **Everything**. Everything is every task the member may see across the workspace.

View types in this spec:

- **List**: rows grouped by status, collapsible;
- **Board**: Kanban by status or any grouping field;
- **Table**: a sheet with task fields (spec 019's model);
- **Calendar**: month and week;
- **Gantt / Timeline**: see US6;
- **Workload**: per-person load over time, as in spec 004.

**Why this priority**: "A List is not a List view" is the second core idea. Without it, the hierarchy only changes the sidebar.

**Independent Test**: On one Folder, add Calendar, Board and Table views with different filters. Reload: all three are kept with their settings. Change a due date in Calendar by dragging: Board and Table show the new date. Open Everything: it lists tasks from every Space the member can see.

**Acceptance Scenarios**:

1. **Given** any node in the tree, **When** a member adds a view, **Then** they choose its type and name, and it shows only tasks at or below that node.
2. **Given** a view, **When** filters, grouping, sorting or visible fields change, **Then** the view keeps them for everyone who opens it (shared view). A member can also save a **personal** view that only they see.
3. **Given** a Calendar view, **When** a task is dragged to another day, **Then** its due date changes under the usual edit rules, and undo reverts it.
4. **Given** a Board view grouped by stage, **When** a task is moved to another stage, **Then** the move follows the board's existing move rules: ownership, Published is terminal, and the celebration. No view creates a second path around them.
5. **Given** the Everything view, **When** a private List exists that the member is not in, **Then** none of its tasks appear.
6. **Given** a member opens a node with no views yet, **Then** a default List view is shown.
7. **Given** today's screens (Board, Content sheet, Video sheet), **Then** they stay reachable at the same addresses, presented as views of the content pipeline.

---

### User Story 3 - Statuses that Folders pass down to their Lists (Priority: P1)

Lists that hold content keep the nine-stage pipeline exactly as it is, with its owners, SLA and celebration. Lists for other work, such as event logistics, vendor onboarding or internal IT, need simpler statuses: "Open › In progress › Waiting › Done".

An admin defines a **status set** on a Space or Folder. A new List created there inherits it. A List can follow its parent's set, which updates when the parent's changes, or use its own.

How custom status sets relate to the content pipeline: **[NEEDS CLARIFICATION: Constitution §II locks the nine-stage pipeline. Are custom status sets (a) allowed only on Lists that are not content work, with the pipeline locked on content Lists, (b) allowed everywhere, which needs a constitution amendment, or (c) not wanted, so every List uses the pipeline?]**

**Why this priority**: Inherited statuses are what let one tool run several kinds of work without every team bending to the content pipeline.

**Independent Test**: On a Folder, define "Open › In progress › Waiting › Done". Create two Lists in it: both use that set. Rename "Waiting" to "Blocked" on the Folder: both Lists show "Blocked", and their tasks keep their place. Create a content List: it uses the nine-stage pipeline, and its tasks still get SLA badges.

**Acceptance Scenarios**:

1. **Given** a status set on a Folder, **When** a List is created in it, **Then** the List inherits the set.
2. **Given** a List that follows its parent, **When** the parent's set is edited, **Then** the List shows the change. Tasks in a renamed status stay in it.
3. **Given** a status that still holds tasks, **When** an admin deletes it, **Then** they must choose a status to move those tasks to first.
4. **Given** a content-pipeline List, **Then** its stages, stage owners, SLA and celebrations behave exactly as on today's Board.
5. **Given** every status set, **Then** it has at least one "not started", one "active" and one "done" status. "Done" tasks count as complete in every view and count.
6. **Given** a task moved from a pipeline List to a custom-status List (or back), **Then** the member picks its status in the target List before the move completes.

---

### User Story 4 - Switch features on per Space (Priority: P2)

An admin opens a Space's settings and sees a list of **features** with on/off switches:

- Priorities
- Tags
- Custom fields
- Multiple assignees
- Start dates
- Dependencies
- Time estimates
- Checklists
- Recurring tasks
- SLA tracking
- Islam Check stage (today's nine-stage choice, per Space)

Switching a feature off hides its controls, columns and filters in that Space. Its data is kept, and switching it back on restores it.

**Why this priority**: This is ClickUp's "modular complexity". It keeps a small team's Space simple. It depends on the hierarchy (US1), so it comes after it.

**Independent Test**: Switch Tags off in Space A. Tasks in A show no tag control, and A's views have no Tags column or filter. Space B still shows tags. Switch Tags back on in A: the tags set earlier are still there.

**Acceptance Scenarios**:

1. **Given** a feature switched off in a Space, **Then** no view, task panel, filter or bulk action in that Space shows it.
2. **Given** a feature switched back on, **Then** all values set before are shown again, unchanged.
3. **Given** the Everything view, **When** tasks come from Spaces with different features, **Then** a column shows values only for tasks whose Space has the feature on.
4. **Given** a new Space, **Then** it starts with the workspace's default set of features, which admins choose.
5. **Given** SLA tracking off in a Space, **Then** its tasks show no SLA badge and don't count as breached anywhere.

---

### User Story 5 - Richer tasks (Priority: P2)

A member opens a task and can:

- **Assign** several people. The task owner stays fixed, as today.
- Set a **start date** as well as a due date.
- Add **tags**. Tags belong to the Space, and tasks can be filtered by them.
- Add a **checklist** of items with checkboxes. Items can be assigned and reordered, and the task shows "3/5".
- Add a **dependency**: "waiting on" or "blocking" another task. A task waiting on an open task shows a warning.
- **Link** related tasks without a dependency.
- Add the task to **other Lists** as well as its home List (one home, many places). It shows in those Lists' views and is the same task everywhere.
- Fill **custom fields** set by its **task type**. A Video has "Length" and "Shoot date"; a Paid ad has "Budget" and "Channel".
- Make the task **recurring**: "every Monday", "monthly on the 1st", "every 2 weeks after done". When it is completed, the next one is created.
- Create a task **from a template**, which copies name, type, fields, checklist and subtasks.

**Why this priority**: These close the task-level gaps the team used in ClickUp. Each one can ship on its own, behind its US4 switch.

**Independent Test**: For each capability, do one round trip on a single task. Add a second assignee, a start date, two tags, a 3-item checklist, a "waiting on" link, a second List and a type field. Reload: all are kept, and each shows in a Table view column. Complete a weekly recurring task: next week's copy appears, open.

**Acceptance Scenarios**:

1. **Given** a task with two assignees, **Then** it appears in both people's My tasks, workload and notifications.
2. **Given** a task added to a second List, **When** its stage changes in one place, **Then** it shows the new stage in both. Removing it from the second List doesn't delete it. A task can't be removed from its home List; it can only be moved.
3. **Given** task A waiting on task B, **When** B is not done, **Then** A shows "Waiting on B". **When** B is done, **Then** the warning clears. A dependency that would make a loop (A waits on B, B waits on A) is refused.
4. **Given** a recurring task, **When** it is marked done, **Then** exactly one next copy is created with the next date. Its checklist is reset, and its comments and attachments are not copied.
5. **Given** a task type with custom fields, **When** a task's type changes, **Then** fields the new type shares keep their values. The others are hidden, not deleted, until the type changes back.
6. **Given** a template, **When** a task is created from it, **Then** the new task has the template's name, type, fields, checklist and subtasks. The new task's dates are set relative to its creation date.

---

### User Story 6 - Gantt / Timeline for waterfall plans (Priority: P2)

A manager opens a Folder's **Gantt** view. Each task is a bar from start date to due date, grouped by List. Dependencies are arrows. Milestones are diamonds. Dragging a bar moves its dates, and tasks that depend on it can shift with it. The **critical path**, the chain that sets the end date, can be highlighted. Today's project plan, with its steps, milestones and days, shows in the same view.

**Why this priority**: Waterfall planning is how the team already plans campaigns (Aspiring / Focus plan). A chart makes the plan readable. It depends on start dates and dependencies (US5).

**Independent Test**: In a Folder with five dated tasks, two dependencies and one milestone, open Gantt. Drag the first task two days later and choose "shift dependents": its dependents move by two business days. Switch on critical path: the longest chain is highlighted.

**Acceptance Scenarios**:

1. **Given** a task with a start and due date, **Then** it shows as a bar between them. A task with only a due date shows as a point on that day.
2. **Given** a bar dragged or resized, **Then** the task's dates change under the usual edit rules, and undo reverts it.
3. **Given** a dependency, **When** the earlier task moves past the later task's start, **Then** the member is asked to shift dependents or leave them, and conflicts are marked.
4. **Given** critical path on, **Then** the chain of dependent tasks with no slack that ends last is highlighted.
5. **Given** the existing project plan, **Then** its steps and milestones show in a project's Gantt view, with the same days and dates as the Projects screen.

---

### User Story 7 - Sprints, Goals and Dashboards (Priority: P3)

Each of these needs its own spec. They are recorded here so the hierarchy leaves room for them:

- **Sprints.** A Sprint Folder holds one List per sprint, with dates, points per task, a backlog List, and burndown and burnup charts. Unfinished tasks roll over to the next sprint.
- **Goals and Targets.** A Goal has number, yes/no, currency or task targets. A task target completes as its linked tasks are done. The Aspiring / Focus plan becomes Goals.
- **Dashboards.** Cards for task counts by status, workload, time logged, sprint burndown and SLA breaches, at any level.

**Why this priority**: These are useful, but they come after the structure they read from.

**Independent Test**: Planned in follow-up specs.

---

### User Story 8 - Docs as a view (Priority: P3)

A Folder holds a **Doc** view: a wiki of nested pages, such as a campaign brief, a glossary or an SOP. It uses the brief editor's formatting, and can link to tasks.

**Why this priority**: Useful shared reference, but the brief editor already covers most writing inside tasks.

**Independent Test**: Planned in a follow-up spec.

---

### User Story 9 - Forms and Automations (Priority: P3)

- **Forms.** A shareable form whose answers create tasks in a chosen List, with fields mapped to task fields. Sign-in is required, since the workspace is internal.
- **Automations.** "When [trigger] and [condition], then [action]", such as "when a task moves to Design Review, assign the Brand Director and add a comment". Prebuilt templates are included.

**Why this priority**: These are big wins for intake and routine work, but they need the stable structure and fields above.

**Independent Test**: Planned in follow-up specs.

---

### Edge Cases

- **Existing addresses.** Bookmarked `/board`, `/board?view=sheet…` and `/sheets` links keep working and open the matching view.
- **Content and Video sheets.** They keep their row source and grouping (spec 019). They become Table views of the content pipeline Lists, and nothing a team set up is lost.
- **Sheet folders vs hierarchy Folders.** Today's team Sheet folders stay as they are. A team sheet can be added as a view on a node, but sheets are not moved into the hierarchy automatically.
- **Moving a task across Spaces** whose feature switches differ: values for features switched off in the target are kept, not deleted, and come back if the task moves back.
- **Moving a task from a nine-stage Space to an eight-stage Space.** The constitution makes a task's nine-stage choice fixed at creation, so the task keeps its own stage count. This only affects tasks created afterwards.
- **Private nodes and existing followers.** A member who follows a task inside a private List they aren't in gets no notifications for it, and the follow is shown as unavailable.
- **Deleting a Space, Folder or List with tasks.** Only admins may, only once it is empty or archived, and with a typed confirmation. A deleted node stays deleted: re-running an import never brings it back.
- **Arabic and phones.** The sidebar tree, view tabs, Calendar and Gantt mirror in Arabic. On phones the tree is a drawer, and Gantt falls back to a dated list.
- **Large views.** Everything and Space views with thousands of tasks stay usable; see SC-003.
- **Recurring task edge dates.** "Monthly on the 31st" falls on the last day of shorter months. Business-day rules match the SLA calendar.

## Requirements *(mandatory)*

### Functional Requirements

**Hierarchy (US1)**

- **FR-001**: The system MUST organize work as Workspace › Space › Folder › (optional) Subfolder › List › Task › Subtask, with checklists inside tasks. Subfolders MUST NOT contain Folders.
- **FR-002**: A List MUST be able to sit directly in a Space, with no Folder.
- **FR-003**: Every task MUST have exactly one home List. A subtask's home is its parent's List.
- **FR-004**: Spaces, Folders, Subfolders and Lists MUST support create, rename, reorder, move, archive and restore. Delete MUST be admin-only and need a typed confirmation. A non-empty node MUST be archived before it can be deleted.
- **FR-005**: Opening a node MUST show tasks at that node and every node below it.
- **FR-006**: Only admins MAY create Spaces. Admins and superusers MAY create Folders and Lists in any Space they can see. Users MAY create Lists only where a Space allows it, through a per-Space setting that is off by default.
- **FR-007**: A Space, Folder or List MAY be marked private, with named members. Non-admins who are not named MUST NOT see it, its tasks, or its contents in any view, search, count, notification or export. Admins MUST see everything.
- **FR-008**: On release, every existing task MUST be placed in a List by the mapping in US1, with no task lost, duplicated, or changed in stage, owner, dates or SLA clock. A count of tasks before and after MUST match.

**Views (US2)**

- **FR-009**: A member MUST be able to add List, Board, Table, Calendar, Gantt and Workload views to any Space, Folder, Subfolder or List, and to the Everything view.
- **FR-010**: Each view MUST keep its own filters, grouping, sorting, visible fields and column order. Views MUST be shared by default. A member MAY save a personal view only they see.
- **FR-011**: Every view MUST change tasks only through the same rules as the board: stage ownership, Published is terminal, celebrations and SLA reset. No view type MAY add a way around them.
- **FR-012**: Today's Board, Content sheet and Video sheet MUST stay reachable at their current addresses and behave as they do now.
- **FR-013**: The Everything view MUST list every task the member may see across all Spaces, and only those.
- **FR-014**: Calendar MUST offer month and week layouts. Dragging a task to a day sets its due date, and tasks without a date are listed apart.

**Statuses (US3)**

- **FR-015**: Admins MUST be able to define status sets on a Space or Folder. Each status has a name, a colour and a group (not started, active, done).
- **FR-016**: A new List MUST inherit its nearest parent's status set. A List MAY follow its parent, receiving later changes, or keep its own copy.
- **FR-017**: Deleting a status that holds tasks MUST require choosing where those tasks go.
- **FR-018**: Content-pipeline Lists MUST keep the nine canonical stages, their owners, SLA thresholds and celebrations unchanged (constitution §II, §V). The scope of custom status sets is set by the US3 clarification.

**Per-Space features (US4)**

- **FR-019**: Each Space MUST have on/off switches for at least: Priorities, Tags, Custom fields, Multiple assignees, Start dates, Dependencies, Time estimates, Checklists, Recurring tasks, SLA tracking, and the Islam Check stage.
- **FR-020**: Switching a feature off MUST hide it everywhere in that Space and MUST keep its data. Switching it back on MUST restore that data unchanged.
- **FR-021**: Admins MUST be able to set the default feature set for new Spaces.

**Tasks (US5)**

- **FR-022**: A task MUST support several assignees, alongside its fixed owner.
- **FR-023**: A task MUST support a start date as well as a due date. The start date MUST NOT be after the due date.
- **FR-024**: Tags MUST belong to a Space, and any member who can edit tasks there MAY create them. Tags MUST be filterable in every view.
- **FR-025**: A task MUST support checklists with items that can be checked, assigned and reordered, and MUST show progress (done/total).
- **FR-026**: A task MUST support "waiting on" and "blocking" dependencies and plain links to other tasks. Loops MUST be refused.
- **FR-027**: A task MAY be added to Lists other than its home, and MUST appear in their views as the same task.
- **FR-028**: Task types MUST be able to define their own custom fields. Field types include text, number, currency, date, dropdown, people, link and checkbox. Changing type MUST hide, not delete, values the new type doesn't have.
- **FR-029**: A task MAY recur on a schedule or a set time after completion. Completing it MUST create exactly one next copy.
- **FR-030**: Members MUST be able to save a task as a template, and create tasks from one. A template includes name, type, fields, checklist and subtasks, with dates relative to creation.

**Gantt (US6)**

- **FR-031**: Gantt MUST draw tasks as bars from start to due date, dependencies as arrows and milestones as markers. It MUST support dragging to reschedule, an optional shift of dependents, and a critical-path highlight.
- **FR-032**: The existing project plan's steps and milestones MUST appear in Gantt with the same days and dates as the Projects screen.

**Cross-cutting**

- **FR-033**: Every new screen, view and control MUST be available in English and Arabic, with right-to-left layout.
- **FR-034**: Every change that creates, moves or edits tasks or nodes MUST have its permission checked before it takes effect, whatever screen it comes from.
- **FR-035**: Every view MUST be usable on a phone-width screen, with the fallbacks in Edge Cases.
- **FR-036**: The parity map in this spec MUST be kept current as later specs (US7–US9) ship.

### Key Entities

- **Workspace**: the whole company. Holds members, Spaces, default feature set and workspace settings.
- **Space**: a major division, such as a brand, team or client group (per the US1 clarification). It has members (or all members), a private flag, feature switches, tags, a default status set, and task types in use.
- **Folder**: groups Lists in a Space. It may hold one level of Subfolders, and may define a status set its Lists inherit.
- **List**: holds tasks of one kind of work. It has a status set (inherited or its own), a private flag and views.
- **Status set**: an ordered list of statuses, each with a name, colour and group. The content pipeline is a fixed, built-in status set.
- **View**: a saved way of looking at a node: type, name, filters, grouping, sort, visible fields, and shared or personal.
- **Task**: as today, plus home List, other Lists, several assignees, start date, tags, checklist, dependencies, links, task-type fields and a recurrence rule.
- **Checklist item**: text, done flag, optional assignee, order.
- **Dependency / Link**: a relation between two tasks, of type waiting on, blocking or related.
- **Task type**: today's content types, extended with their own custom fields.
- **Template**: a saved task shape that new tasks are created from.
- **Tag**: a name and colour, belonging to a Space.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After release, 100% of existing tasks are in a List, and the count of tasks visible to each member on the Board is the same as before.
- **SC-002**: A member can create a Folder with two Lists and add a Calendar view to it in under 2 minutes, without help.
- **SC-003**: A view of up to 5,000 tasks opens and shows its first screen of results in under 2 seconds, and scrolling stays smooth.
- **SC-004**: In a test with each member role, 0 tasks from private nodes appear in any view, search, count or notification for a member who isn't in them.
- **SC-005**: Switching a feature off and on again in a Space loses 0 values.
- **SC-006**: Within 4 weeks of release, the team runs at least one non-content workflow (for example events or ops) in Momentum with its own status set, which it previously tracked in ClickUp or by hand.
- **SC-007**: Every ClickUp capability the team used daily before the import is marked Have or This spec in the parity map, so the team no longer needs ClickUp for daily work.
- **SC-008**: 90% of members asked after 2 weeks can find a given campaign's tasks through the sidebar tree on the first try.

## Assumptions

- **Scope.** **[NEEDS CLARIFICATION: How much does this spec deliver? (a) the foundation only, US1–US4, with US5–US9 as their own specs; (b) US1–US6, with US7–US9 as their own specs; or (c) everything, US1–US9, shipped in stages.]** The draft is written for (b). AI features, Chat, Whiteboards, Clips, Meetings, Box, Map and Mind Map views, third-party integrations and webhooks are out of scope.
- **Roles.** The three tiers (admin, superuser, user) stay. A **Guest** role for outside clients is out of scope; it needs its own security review.
- **The content pipeline stays intact.** The nine-stage model, its role-based owners, the SLA matrix, Published being terminal, and celebrations are unchanged for content work (constitution §II, §V). Any wider change goes through a constitution amendment.
- **Nine-stage choice.** It moves from a single workspace setting to a per-Space feature switch. The workspace value becomes the default, and each task's choice stays fixed at creation, as today.
- **Today's screens stay.** Overview, Board, Projects, Team, Capacity, Hours, Settings and Sheets keep working. Board and the sheets become views of the content pipeline; nothing is removed in this spec.
- **One home, many places.** Permissions for a task come from its home List. Adding it to another List doesn't widen who can see it.
- **Time tracking.** Daily hours (spec 014) stays the time record. Per-task timers and timesheets are later work.
- **Design-driven development.** Each new view or major component needs an HTML design file first (constitution §IV): the sidebar tree, view tabs, Calendar, Gantt, Space settings, and the task panel additions.
- **Business days.** Recurrence and Gantt shifting use the same business-day calendar as SLA.
- **Data safety.** As with the importers, the migration into the hierarchy only creates, never overwrites what exists. It is safe to run twice.
