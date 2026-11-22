# Feature Specification: Momentum vs ClickUp — Hierarchy, Views and Modular Features

**Feature Branch**: `claude/wonderful-dirac-k1wflu`

**Created**: 2026-11-22

**Status**: Draft (clarified)

**Input**: User description: "building this CRM tool vs clickup", followed by a two-part summary of ClickUp:

- **Part 1, methodology.** The hierarchy (Workspace › Space › Folder › Subfolder › List › Task › Subtask › Checklist). Four principles: one home, many places; modular complexity (ClickApps); views separate from structure; inherited statuses. The methods it supports: Scrum, Kanban, Waterfall, OKR-led.
- **Part 2, features.** Task management, views, collaboration, planning and tracking, automation, AI, admin and integrations.

**Design**: [design/clickup-hierarchy.html](../../design/clickup-hierarchy.html), an interactive preview of the sidebar tree, views, status words and Space features.

## Context

The team moved its work from ClickUp into Momentum with a one-time import. Momentum already covers much of what they used there. What it lacks is ClickUp's **organizing model**:

- Every task sits on one board, and the only grouping is by brand, project and pillar.
- Views are fixed screens (Board, Sheets, Projects, Team, Capacity). You can't open a board or a calendar on just one campaign.
- Every feature is on for everyone. A small team can't switch off what it doesn't need.

This spec brings that model to Momentum. It adds a hierarchy and views that can be opened at any level of it. It adds a second kind of task, a simple task, for work that isn't a content deliverable. Each team can call the pipeline stages by its own words, and Folders pass those words down to their Lists. Features can be switched on or off per Space. It does **not** copy ClickUp's whole catalogue. The parity map below sorts each ClickUp feature into one of four groups:

- **Have**: already in Momentum;
- **This spec**;
- **Later**: its own spec, after this one;
- **Not planned**.

### The pipeline as built

Every pipeline task moves through the process the team built, as today's Board shows it. There are 11 stages, in this order:

| # | Stage | Arabic | Owner |
|---|---|---|---|
| 1 | To Do | افكار للتنفيذ | Assignee |
| 2 | C-In Progress | كتابة المحتوى | Assignee |
| 3 | C-Review | مراجعة المحتوى | Marketing Manager |
| 4 | C-Check | موافقة نهائية على المحتوى | Managing Director |
| 5 | Ready For Design | جاهز للتصميم | Assignee |
| 6 | D-In Progress | تصميم | Assignee |
| 7 | D-Check | مراجعة التصميم | Brand Director |
| 8 | F-Check | المراجعة النهائية | Marketing Manager |
| 9 | Ready to Publish | جاهز للنشر | Assignee |
| 10 | Scheduled | مجدول | Assignee |
| 11 | Published | تم النشر | Final |

C-Check is the Islam Check stage. Tasks created without it have 10 stages. The constitution's §II table still lists nine stages under older names; it is out of date and is corrected in the same amendment US5 needs.

### Parity map

| ClickUp feature | Momentum today | Decision |
|---|---|---|
| Workspace › Space › Folder › List hierarchy | Brands, Projects, Pillars; Sheet folders | **This spec** (US1) |
| Subfolders | No | **This spec**, one extra level (US1) |
| Private Spaces, Folders, Lists | No | **This spec** (US1) |
| Custom statuses, inherited from Folder | Fixed 9-stage pipeline; sheets map their own words to it (spec 019) | **This spec** (US3), as status words mapped to the pipeline |
| ClickApps (per-Space feature switches) | No | **This spec** (US4) |
| Simple tasks with their own short workflow | No: every task goes through the pipeline stages | **This spec** (US5): pipeline tasks and simple tasks |
| List view | Sheets (Content, Video, team sheets) | **This spec**: as a view at any level (US2) |
| Board (Kanban) | Board | Have; becomes a view at any level (US2) |
| Table view | Sheets, with task fields (spec 019) | Have; becomes the Sheet view at any level, unchanged (US2) |
| Calendar view | Due dates only, no calendar | **This spec** (US2) |
| Workload view | Capacity screen, Workload tab (spec 004) | Have; becomes a view at any level (US2) |
| Everything view | Board "All" scope | **This spec** (US2) |
| Gantt / Timeline, dependencies, critical path | Project steps have days and milestones, no chart | Later (US7) |
| Activity view | Notifications and Inbox, no event log | Later (needs an event log, see HANDOVER §14) |
| Box, Map, Mind Map views | No | Not planned |
| Task › Subtask | Subtasks, video clips, project sub-steps | Have |
| Checklists inside a task | No | Later (US6) |
| One home, many places (task in several Lists) | No | Later (US6) |
| Priorities, assignees, due dates | Yes (one assignee + owner) | Have |
| Start dates, tags, multiple assignees | No | Later (US6) |
| Watchers | Followers (spec 012) | Have |
| Custom fields by task type | Sheet columns, content types | Later (US6) |
| Task types | Content types (Post, Video, Reel…) | Have |
| Task templates, recurring tasks | Paste plan; "standing" projects | Later (US6) |
| Dependencies, relationships, links | No | Later (US6) |
| Comments, threads, @mentions | Yes | Have |
| Assigned comments | No | Later |
| Docs (wikis, nested pages, Doc as a view) | Task briefs only | Later (US9) |
| Forms, Automations | Paste plan only | Later (US10) |
| Proofing (annotate images, PDFs, video) | Attachments with preview | Later (strong fit for D-Check) |
| Chat, Whiteboards, Clips, Meetings Hub | No | Not planned |
| Goals, Dashboards, Sprints | Aspiring / Focus plan; Overview, Capacity | Later (US8) |
| Time tracking, timesheets, estimates | Daily hours (spec 014), hour estimates | Have; per-task tracking Later |
| AI (Brain, agents, writing, summaries, standups) | No | Not planned |
| Roles Owner / Admin / Member / Guest | admin / superuser / user | Have; Guest Later |
| Integrations, API, webhooks, Drive automations | No | Not planned |
| Desktop and mobile apps | Installable web app | Have |

## Clarifications

### Session 2026-11-22

- **Q: What is a Space?**
  A: **One Space per brand.** Inside each brand's Space, **Folders are per team**. Lists sit inside the team Folders.
- **Q: How do custom statuses relate to the locked pipeline?**
  A: **As in the sheets (spec 019 US7).** A Folder or List writes its own words for the pipeline stages, and each word maps to one canonical stage. The pipeline stages, their owners, SLA and celebrations stay underneath, unchanged.
- **Q: How much does this spec deliver?**
  A: **The foundation only: US1–US4.** Richer tasks (US6), Gantt (US7), and Sprints, Goals, Dashboards, Docs, Forms and Automations (US8–US10) each get their own spec later. (US5 was added in a later question, below.)
- **Q: Planning tasks don't fit the pipeline stages. What then?**
  A: **Two kinds of tasks.** **Pipeline tasks** are linked to the pipeline: pipeline stages, stage owners, SLA and celebrations, as today. **Simple tasks** are not linked to it: To Do › In progress › Done, for planning, admin and event work. This needs a constitution amendment to §II before it is built.
- **Q: What happens to subtasks?**
  A: **They stay part of the model** (Task › Subtask), as today: the task panel's "New subtask" creates a real task under its parent, and video clips sit under their video.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organize work as Brand › Team › List (Priority: P1)

A member opens the sidebar and sees the workspace tree:

- **Spaces, one per brand**, such as "Forefront" and "TSC", in the brand's colour.
- **Folders, one per team** in each Space, such as "Content", "Design", "Video" or "Events". A Folder may hold one level of **Subfolders**, such as "Ramadan 2027".
- **Lists** in each Folder, such as "Social posts", "LinkedIn articles" or "Podcast". A List may also sit directly in a Space, with no Folder.

Admins create, rename, reorder, move and archive Spaces. Admins and superusers do the same for Folders and Lists. Every task has exactly one **home List**. Opening a node shows its tasks, including those of everything below it.

On release, all existing work is placed in the tree:

- Each **brand** becomes a Space. Tasks with no brand go to a **"No brand"** Space.
- Each Space gets one team Folder, **"Marketing"**, which admins then split into teams.
- Each **project** (including content themes) becomes a List in its brand's Marketing Folder. Tasks with no project go to a **"General"** List.
- Pillars stay a task field. Nothing is lost or duplicated.

**Why this priority**: The hierarchy is the core of ClickUp's method. Views, status words and per-Space features all depend on it.

**Independent Test**: In the Forefront Space, create a "Design" Folder with a "Ramadan 2027" Subfolder and two Lists. Move three existing tasks into one List. Open the Folder: it shows those three tasks. Open the Space: it shows them too. The Board "All" scope shows every task it showed before.

**Acceptance Scenarios**:

1. **Given** an admin, **When** they create a Space for a new brand, a team Folder in it, a Subfolder and a List, **Then** all four appear in the sidebar tree in that nesting, the Space in the brand's colour.
2. **Given** a member who is not an admin, **When** they try to create a Space, **Then** they can't. Creating a Folder or List follows FR-006.
3. **Given** a Subfolder, **When** someone tries to create a Folder inside it, **Then** it is refused: Subfolders don't nest.
4. **Given** a task in List A, **When** it is moved to List B, even in another Space, **Then** its home is B, and its brand becomes B's Space. Its stage, SLA clock, owner, comments and attachments are unchanged.
5. **Given** a Folder holding 12 tasks across its Lists, **When** it is archived, **Then** it and its Lists leave the tree, the 12 tasks are hidden from views, and restoring the Folder brings everything back as it was.
6. **Given** release day, **When** any member opens the Board, **Then** every task they could see before is still visible, in its same stage.
7. **Given** a Space, Folder or List marked **private** with named members, **When** any other non-admin member browses or searches, **Then** they don't see it or its tasks. Admins always see everything.

---

### User Story 2 - Views at any level, separate from structure (Priority: P1)

A member opens the Forefront › Design Folder and adds a **Calendar** view: every task in the Folder, by due date. They add a **Board** view grouped by stage, then a **Sheet** view with Assignee, Due date and Platform columns. Each view keeps its own filters, grouping, sorting and visible fields. The views show as tabs on the Folder.

The same view types can be added to a Space, a Folder, a Subfolder, a List, or **Everything**. Everything is every task the member may see across all brands.

View types in this spec:

- **List**: rows grouped by status, collapsible;
- **Board**: Kanban by status or any grouping field;
- **Sheet**: today's spreadsheet, unchanged in look and behaviour (specs 013–020), with task field columns and regular columns (spec 019);
- **Calendar**: month and week;
- **Workload**: per-person load over time, as in spec 004.

**Why this priority**: "A List is not a List view" is the second core idea. Without it, the hierarchy only changes the sidebar.

**Independent Test**: On one Folder, add Calendar, Board and Sheet views with different filters. Reload: all three are kept with their settings. Change a due date in Calendar by dragging: Board and Sheet show the new date. Open Everything: it lists tasks from every Space the member can see.

**Acceptance Scenarios**:

1. **Given** any node in the tree, **When** a member adds a view, **Then** they choose its type and name, and it shows only tasks at or below that node.
2. **Given** a view, **When** filters, grouping, sorting or visible fields change, **Then** the view keeps them for everyone who opens it (shared view). A member can also save a **personal** view that only they see.
3. **Given** a Calendar view, **When** a task is dragged to another day, **Then** its due date changes under the usual edit rules, and undo reverts it.
4. **Given** a Board view, **Then** its columns are the pipeline as built, in order, with their original names, as on today's Board. **When** a task is moved to another stage, **Then** the move follows the board's existing move rules: ownership, Published is terminal, and the celebration. No view creates a second path around them.
5. **Given** the Everything view, **When** a private List exists that the member is not in, **Then** none of its tasks appear.
6. **Given** a member opens a node with no views yet, **Then** a default List view is shown.
7. **Given** today's screens (Board, Content sheet, Video sheet), **Then** they stay reachable at the same addresses. They are presented as saved views on Everything, and they keep their row source and grouping.

---

### User Story 3 - Each team's own status words, mapped to the pipeline (Priority: P1)

Each team describes progress in its own words. The Video team says "Scripting › Shooting › Editing › Final cut › Live". The Design team says "Brief in › Designing › Client review › Approved › Posted". Underneath, every task still moves through the same pipeline stages, with the same owners, SLA and celebrations.

This works as in the sheets (spec 019 US7). On a Space, a Folder or a List, a member with edit rights opens **Status words**. There, they write their words next to each pipeline stage, separated by commas. The first word is the one shown.

- A new List **inherits** the words of its nearest parent. A List can follow its parent (receiving later changes) or keep its own copy.
- A stage with no word shows the board's name.
- Typing or pasting one of the words into a status cell sets that stage, ignoring case and spacing.
- Views of a single List or Folder show its words. Views that mix Lists with different words (a Space, Everything) show the board's names, unless "Show each List's words" is chosen.

**Why this priority**: This is ClickUp's inherited statuses, made to fit Momentum's fixed approval chain (constitution §II).

**Independent Test**: On the Video Folder, write "Scripting" for C-In Progress, "Editing" for D-In Progress and "Live" for Published. Create two Lists in it: both show those words. Change "Editing" to "Edit bay" on the Folder: both Lists show "Edit bay". Move a task to "Live" from a Video List: on the Board it is Published, and it got the same celebration and SLA reset as a move on the Board.

**Acceptance Scenarios**:

1. **Given** status words on a Folder, **When** a List is created in it, **Then** the List shows those words.
2. **Given** a List that follows its parent, **When** the parent's words change, **Then** the List shows the change. No task changes stage.
3. **Given** a List with its own words, **When** the parent's words change, **Then** the List keeps its own.
4. **Given** a word typed or pasted into a status cell, **When** it matches a word for a stage, **Then** the task moves to that stage under the usual move rules. A word that matches nothing is refused with a message listing the valid words.
5. **Given** two words for the same stage ("Live, Posted"), **Then** both set that stage, and the first is shown.
6. **Given** any List, **Then** its stage owners, SLA thresholds, Published-is-terminal and celebrations are those of the mapped stage, exactly as on today's Board.
7. **Given** a task moved between Lists with different words, **Then** its stage is unchanged, and it shows the new List's word for that stage.
8. **Given** the Content and Video sheets' built-in words (C-In Progress, C-Review, Editing, Final Cut…), **Then** they appear as prefilled words on the matching Lists and can be edited.

---

### User Story 4 - Switch features on per Space (Priority: P2)

An admin opens a brand Space's settings and sees a list of **features** with on/off switches. These are the task features that exist today:

- Priorities
- Platform
- Content type
- Pillars
- Hour estimates
- Cover images
- Video clips
- SLA tracking
- Islam Check stage, C-Check (today's C-Check choice, per Space)

Switching a feature off hides its controls, columns and filters in that Space. Its data is kept, and switching it back on restores it. Later specs (US6) add their features to this list.

**Why this priority**: This is ClickUp's "modular complexity". It keeps a small brand's Space simple. It depends on the hierarchy (US1), so it comes after it.

**Independent Test**: Switch Platform off in the TSC Space. Tasks in TSC show no Platform control, and TSC's views have no Platform column or filter. Forefront still shows Platform. Switch it back on in TSC: the platforms set earlier are still there.

**Acceptance Scenarios**:

1. **Given** a feature switched off in a Space, **Then** no view, task panel, filter or bulk action in that Space shows it.
2. **Given** a feature switched back on, **Then** all values set before are shown again, unchanged.
3. **Given** the Everything view, **When** tasks come from Spaces with different features, **Then** a column shows values only for tasks whose Space has the feature on.
4. **Given** a new Space, **Then** it starts with the workspace's default set of features, which admins choose.
5. **Given** SLA tracking off in a Space, **Then** its tasks show no SLA badge and don't count as breached anywhere.
6. **Given** Islam Check switched on or off in a Space, **Then** only tasks created afterwards in that Space follow the new choice. Each existing task keeps its own (constitution: fixed at creation).

---

### User Story 5 - Pipeline tasks and simple tasks (Priority: P1)

A content creator has two kinds of work. "Q1 outlook carousel" is a deliverable: it is written, reviewed, checked, designed, reviewed again and published. "Plan the Q1 content calendar" is not: nobody designs or approves it, and an SLA on it would only add noise.

When creating a task, the member picks its kind:

- **Pipeline task** (linked to the pipeline): the pipeline stages, stage owners, SLA, Published is final, and celebrations, exactly as today.
- **Simple task** (not linked): three statuses, **To Do › In progress › Done**. It has no stage owners, no SLA and no approval chain. Whoever may edit the task may move it.

Each List has a **default kind** for new tasks, such as "Simple" on a "Planning" List. The member can change the kind while creating the task. After that the kind is fixed, as the C-Check choice is today.

A parent and its subtasks can be different kinds. A simple task "Ramadan launch plan" can have pipeline subtasks "Launch copy", "Launch key visual" and "Launch teaser". Each subtask moves through the pipeline with its own assignee. The plan itself is just ticked through To Do › In progress › Done.

**Why this priority**: Without it, planning and admin work either stays outside Momentum or clutters the board and SLA figures with tasks that never pass through design or review.

**Independent Test**: In a "Planning" List with default kind Simple, create "Plan Q1 calendar". It shows To Do › In progress › Done, with no SLA badge. Add a pipeline subtask "Launch copy": it shows C-In Progress, C-Review and the rest, with its SLA badge. Move the plan to Done: the subtask's stage doesn't change. Open the Board: the plan is not counted in any stage column or SLA figure.

**Acceptance Scenarios**:

1. **Given** a member creating a task, **When** the List's default kind is Simple, **Then** the task starts as a simple task at To Do, and the member could have switched it to pipeline before saving.
2. **Given** a simple task, **Then** it never shows an SLA badge, never counts as breached, and never appears in a stage owner's review queue or Inbox.
3. **Given** a simple task, **When** its assignee moves it to Done, **Then** they get a celebration, as for advancing a stage they own.
4. **Given** a saved task, **Then** its kind can't be changed. A member who needs the other kind creates a new task.
5. **Given** a view holding both kinds, **Then** pipeline stages and simple statuses show as separate groups (Board columns, List groups), pipeline first, and a **Kind** filter offers All, Pipeline or Simple.
6. **Given** status words on a Folder or List, **Then** they can rename the three simple statuses as well as the pipeline stages, under the same rules.
7. **Given** Workload and Capacity, **Then** open simple tasks count their hour estimates like pipeline tasks. Done simple tasks don't count, as Published ones don't.
8. **Given** a parent and its subtasks, **Then** each keeps its own kind, and moving one never moves another.

---

### Later (own specs, recorded for direction)

- **US6 - Richer tasks**: several assignees, start dates, tags, checklists, dependencies and links, a task in several Lists (one home, many places), custom fields by task type, recurring tasks, templates.
- **US7 - Gantt / Timeline**: bars, dependency arrows, milestones, critical path. The project plan is drawn on it.
- **US8 - Sprints, Goals and Dashboards.**
- **US9 - Docs as a view**: a wiki of nested pages on a Folder or List.
- **US10 - Forms and Automations.**

The hierarchy and views in this spec must leave room for each: a view type can be added, and a feature can be added to the Space switches.

### Edge Cases

- **Existing addresses.** Bookmarked `/board`, `/board?view=sheet…` and `/sheets` links keep working and open the matching view.
- **Sheet folders vs hierarchy Folders.** Today's team Sheet folders stay as they are. A team sheet can be added as a view on a node, but sheets are not moved into the hierarchy automatically.
- **Kinds on release day.** Every existing task becomes a pipeline task. Nothing becomes a simple task on its own; teams create simple tasks from then on.
- **Simple tasks on today's screens.** The Board, Content sheet and Video sheet show pipeline tasks only, as today. Simple tasks show in the new views, My tasks and Workload.
- **Brand and Space stay in step.** A task's brand is its Space. Renaming a Space renames the brand. A new brand added in Settings creates its Space.
- **Projects and Lists stay in step.** A project that became a List keeps its plan, steps and days on the Projects screen. Renaming one renames the other.
- **Moving a task between Spaces** whose feature switches differ: values for features switched off in the target are kept, not deleted, and come back if the task moves back.
- **Status words that clash.** The same word can't be given to two stages in one List; saving is refused, naming the clash.
- **Private nodes and existing followers.** A member who follows a task inside a private List they aren't in gets no notifications for it, and the follow is shown as unavailable.
- **Deleting a Space, Folder or List with tasks.** Only admins may, only once it is empty or archived, and with a typed confirmation. A deleted node stays deleted: re-running an import never brings it back.
- **Arabic and phones.** The sidebar tree, view tabs and Calendar mirror in Arabic. Status words may be written in Arabic. On phones the tree is a drawer.
- **Large views.** Everything and Space views with thousands of tasks stay usable; see SC-003.

## Requirements *(mandatory)*

### Functional Requirements

**Hierarchy (US1)**

- **FR-001**: The system MUST organize work as Workspace › Space (one per brand) › Folder (per team) › (optional) Subfolder › List › Task › Subtask. Subfolders MUST NOT contain Folders.
- **FR-002**: A List MUST be able to sit directly in a Space, with no Folder.
- **FR-003**: Every task MUST have exactly one home List. A subtask's home is its parent's List. A task's brand MUST be its home List's Space.
- **FR-004**: Spaces, Folders, Subfolders and Lists MUST support create, rename, reorder, move, archive and restore. Delete MUST be admin-only and need a typed confirmation. A non-empty node MUST be archived before it can be deleted.
- **FR-005**: Opening a node MUST show tasks at that node and every node below it.
- **FR-006**: Only admins MAY create Spaces. Admins and superusers MAY create Folders and Lists in any Space they can see. Users MAY create Lists only where a Space allows it, through a per-Space setting that is off by default.
- **FR-007**: A Space, Folder or List MAY be marked private, with named members. Non-admins who are not named MUST NOT see it, its tasks, or its contents in any view, search, count, notification or export. Admins MUST see everything.
- **FR-008**: On release, existing work MUST be placed as in US1: brands become Spaces, each Space gets a "Marketing" Folder, projects become Lists, and other tasks go to "General" (and "No brand" where there is no brand). No task may be lost, duplicated, or changed in stage, owner, dates or SLA clock. A count of tasks before and after MUST match. Running the placement twice MUST change nothing.

**Views (US2)**

- **FR-009**: A member MUST be able to add List, Board, Sheet, Calendar and Workload views to any Space, Folder, Subfolder or List, and to the Everything view.
- **FR-010**: Each view MUST keep its own filters, grouping, sorting, visible fields and column order. Views MUST be shared by default. A member MAY save a personal view only they see.
- **FR-011**: Every view MUST change tasks only through the same rules as the board: stage ownership, Published is terminal, celebrations and SLA reset. No view type MAY add a way around them.
- **FR-012**: Today's Board, Content sheet and Video sheet MUST stay reachable at their current addresses and behave as they do now.
- **FR-013**: The Everything view MUST list every task the member may see across all Spaces, and only those.
- **FR-013a**: Every Board view, at every level (Space, Folder, Subfolder, List, team view, Everything), MUST show the pipeline as built: its stages as columns in their original order, with their original English and Arabic names, owners and look, exactly as today's Board. Status words MUST NOT rename Board columns; they apply in the List, Sheet and Calendar views. Simple tasks, when shown, sit in their own three columns after the pipeline.
- **FR-014a**: The Sheet view MUST be the existing spreadsheet, not a new or simpler table. It keeps its menu bar and toolbar, name box, cell editing, keyboard navigation, copy and paste (including from Excel and Google Sheets), formatting, merges, frozen panes, sort and filter, comments, multi-area selection, the power tips, and the Fields drawer with task field and regular columns. Opened on a Space, Folder or List, it shows that node's tasks as linked rows.
- **FR-014**: The Calendar MUST be one continuous calendar, as a regular calendar is: every task with a date sits on its day, past and future. Members move back and forward through any month or week, and Today returns to the current date. Finished work stays on its day, marked as done. Campaigns are a filter on the calendar, not separate month or campaign Lists. Dragging a task to a day sets its due date, and tasks without a date are listed apart.

**Status words (US3)**

- **FR-015**: A Space, Folder or List MUST be able to hold status words: for each pipeline stage, zero or more words, with the first one shown. Admins and superusers MAY edit them; users MAY NOT.
- **FR-016**: A new List MUST inherit the words of its nearest parent. A List MAY follow its parent, receiving later changes, or keep its own copy.
- **FR-017**: Typing, pasting or filling a word into a status cell MUST set the mapped stage, ignoring case and spacing, under the usual move rules. Unknown words MUST be refused.
- **FR-018**: The pipeline stages, their owners, SLA thresholds, Published-is-terminal and celebrations MUST stay unchanged and apply through the mapping (constitution §II, §V). Words change only what is shown and typed.
- **FR-019**: List, Sheet and Calendar views of one List or Folder MUST show its words. Board views always show the pipeline's own names (FR-013a). Views mixing Lists with different words MUST show the board's names, with an option to show each List's words.

**Per-Space features (US4)**

- **FR-020**: Each Space MUST have on/off switches for: Priorities, Platform, Content type, Pillars, Hour estimates, Cover images, Video clips, SLA tracking, and the Islam Check stage.
- **FR-021**: Switching a feature off MUST hide it everywhere in that Space and MUST keep its data. Switching it back on MUST restore that data unchanged.
- **FR-022**: Admins MUST be able to set the default feature set for new Spaces. Only admins MAY change a Space's switches.

**Cross-cutting**

- **FR-023**: Every new screen, view and control MUST be available in English and Arabic, with right-to-left layout.
- **FR-024**: Every change that creates, moves or edits tasks or nodes MUST have its permission checked before it takes effect, whatever screen it comes from.
- **FR-025**: Every view MUST be usable on a phone-width screen.
- **FR-026**: The parity map in this spec MUST be kept current as later specs (US6–US10) ship.

**Task kinds (US5)**

- **FR-027**: Every task MUST be either a pipeline task (pipeline stages, owners, SLA, celebrations, Published is final) or a simple task (To Do › In progress › Done). The kind MUST be chosen at creation and MUST NOT change afterwards.
- **FR-028**: Each List MUST have a default kind for new tasks, which admins and superusers set. New Lists default to Pipeline.
- **FR-029**: Simple tasks MUST have no SLA, no stage owners and no approval steps. Any member who may edit the task MAY change its status.
- **FR-030**: Moving a simple task to Done MUST celebrate for its assignee.
- **FR-031**: A subtask's kind MUST be independent of its parent's. Changing one task's status MUST NOT change another's.
- **FR-032**: Views holding both kinds MUST group pipeline stages and simple statuses separately and MUST offer a Kind filter. Status words MUST cover the three simple statuses as well.
- **FR-033**: Workload and Capacity MUST count open simple tasks' hour estimates. SLA figures and review queues MUST leave simple tasks out.
- **FR-034**: On release, every existing task MUST become a pipeline task.

### Key Entities

- **Workspace**: the whole company. Holds members, Spaces, default feature set and workspace settings.
- **Space**: one brand. It has the brand's name and colour, members (or all members), a private flag, feature switches, and status words.
- **Folder**: one team inside a Space. It may hold one level of Subfolders, and may hold status words that its Lists inherit.
- **List**: holds tasks of one stream of work, such as a project or theme. It has a private flag, views, and status words (inherited or its own).
- **Status words**: for one Space, Folder or List, the words written for each pipeline stage, and whether it follows its parent.
- **View**: a saved way of looking at a node: type, name, filters, grouping, sort, visible fields, and shared or personal.
- **Task**: as today, plus its home List and its **kind** (pipeline or simple), fixed at creation. Subtasks stay as today, each with its own kind.
- **List default kind**: the kind new tasks in a List start as.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After release, 100% of existing tasks are in a List, and the count of tasks visible to each member on the Board is the same as before.
- **SC-002**: A member can create a team Folder with two Lists and add a Calendar view to it in under 2 minutes, without help.
- **SC-003**: A view of up to 5,000 tasks opens and shows its first screen of results in under 2 seconds, and scrolling stays smooth.
- **SC-004**: In a test with each member role, 0 tasks from private nodes appear in any view, search, count or notification for a member who isn't in them.
- **SC-005**: Switching a feature off and on again in a Space loses 0 values.
- **SC-006**: Within 4 weeks of release, at least two teams have written their own status words, and 0 tasks have skipped a stage owner's approval because of them.
- **SC-007**: 90% of members asked after 2 weeks can find a given team's work for a brand through the sidebar tree on the first try.
- **SC-008**: Within 4 weeks of release, planning and admin work is created as simple tasks, and 0 simple tasks appear in SLA figures or review queues.

## Assumptions

- **Scope.** This spec covers US1–US5. US6–US10 get their own specs. AI features, Chat, Whiteboards, Clips, Meetings, Box, Map and Mind Map views, third-party integrations and webhooks are not planned.
- **Teams are Folders, not a member attribute.** Members are not assigned to teams. A team Folder is where that team's Lists live; anyone with access to the Space can see it unless it is private.
- **Starting layout.** Each Space starts with a single "Marketing" Folder, because today's data has no team grouping. Admins split it into team Folders and move Lists after release.
- **Roles.** The three tiers (admin, superuser, user) stay. A **Guest** role for outside clients is out of scope; it needs its own security review.
- **The content pipeline stays intact.** Every pipeline task runs on the pipeline stages under its List's words. Stages can't be skipped or reordered by words; only the per-Space Islam Check switch removes a stage, as today's C-Check choice does.
- **Constitution amendment first.** Simple tasks are a second workflow beside the pipeline stages. Constitution §II (and §V, for the Done celebration) must be amended before US5 is built. The pipeline itself doesn't change.
- **Subtasks.** They stay as today: a subtask is a real task under a parent, living in its parent's List and following that List's privacy.
- **Nine-stage choice.** It moves from a single workspace setting to a per-Space switch. The workspace value becomes the default, and each task's choice stays fixed at creation.
- **Today's screens stay.** Overview, Board, Projects, Team, Capacity, Hours, Settings and Sheets keep working. Nothing is removed in this spec.
- **Visual style.** New screens use Momentum's existing light theme and design tokens (constitution §I): ink text, the dark navigation rail, lime for primary actions, coral for danger and SLA, violet and cyan as accents, Montserrat headings and Inter body text. Each Space shows its brand's colour, and stages keep their pipeline colours. The Sheet view keeps the spreadsheet's own look. A dark theme is not part of this spec.
- **Design-driven development.** The sidebar tree, view tabs, Calendar, Status words and Space settings follow the design file (constitution §IV). The preview linked above is its first version.
- **Data safety.** As with the importers, placing work into the hierarchy only creates, never overwrites what exists. It is safe to run twice.
