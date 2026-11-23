# Feature Specification: Momentum vs ClickUp — Brands, Team Spaces and Views

**Feature Branch**: `claude/wonderful-dirac-k1wflu`

**Created**: 2026-11-22

**Status**: Draft (clarified; structure revised to Teams × Brands)

**Input**: User description: "building this CRM tool vs clickup", followed by a two-part summary of ClickUp:

- **Part 1, methodology.** The hierarchy (Workspace › Space › Folder › Subfolder › List › Task › Subtask › Checklist). Four principles: one home, many places; modular complexity (ClickApps); views separate from structure; inherited statuses. The methods it supports: Scrum, Kanban, Waterfall, OKR-led.
- **Part 2, features.** Task management, views, collaboration, planning and tracking, automation, AI, admin and integrations.

**Design**: [design/teams-brands.html](../../design/teams-brands.html), an interactive preview of brands, team Spaces, views and the hand-off between teams. [design/clickup-hierarchy.html](../../design/clickup-hierarchy.html) is the earlier Brand › Team › List layout (Option A), kept for reference; its status words, Space features, task kinds and Sheet view still apply. [design/noran-workspace.html](../../design/noran-workspace.html) shows one member's own pages: My tasks and My sheets.

## Context

The team moved its work from ClickUp into Momentum with a one-time import. Momentum already covers much of what they used there. What it lacks is ClickUp's **organizing model**:

- Every task sits on one board, and the only grouping is by brand, project and pillar.
- Views are fixed screens (Board, Sheets, Projects, Team, Capacity). You can't open a calendar on one brand, or a board on one team's work.
- Every feature is on for everyone. A small brand can't switch off what it doesn't need.

This spec brings that model to Momentum, shaped around how the team works:

- **Brands hold the work.** Each brand has the same four Folders: **Calendar**, **Assets**, **Sheet** and **Library**.
- **Team Spaces** (Content, Design, Video, Planning) hold no tasks of their own. Each one shows its team's work from every brand.
- **One task, many places.** A task lives in its brand's Calendar and shows in every team Space it belongs to. Nothing is copied, so nothing needs syncing.
- **Views** (List, Board, Sheet, Calendar, Workload) open on any brand, Folder or team Space.

The spec also adds a second kind of task, a simple task, for work that isn't a content deliverable. It does **not** copy ClickUp's whole catalogue. The parity map below sorts each ClickUp feature into one of four groups:

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
| Workspace › Space › Folder › List hierarchy | Brands, Projects, Pillars; Sheet folders | **Built** (US1): brands with four Folders, plus team Spaces |
| One home, many places | No | **Built** (US1, US6; Shows in rules refined by spec 022 US5) |
| Private Spaces | No | **Built** (US1): team Spaces are seen by their members |
| Custom statuses, inherited | Fixed pipeline; sheets map their own words to it (spec 019) | **Built**, then replaced by spec 022 US4: each Space renames or splits the stages (Space stages) |
| ClickApps (feature switches) | No | **Built** (US4): per brand |
| Simple tasks with their own short workflow | No: every task goes through the pipeline | Built (US5), then **removed by spec 022**: every task is a pipeline task |
| List view | Sheets (Content, Video, team sheets) | **Built**: on any brand, Folder or team Space (US2) |
| Board (Kanban) | Board | Have; becomes a view anywhere, always the original process (US2) |
| Table view | Sheets, with task fields (spec 019) | Have; becomes the Sheet view anywhere, unchanged (US2) |
| Calendar view | Due dates only, no calendar | **Built** (US2): one continuous calendar, by publishing or due date |
| Workload view | Capacity screen, Workload tab (spec 004) | Have; becomes a view anywhere (US2) |
| Everything view | Board "All" scope | **Built** (US2) |
| Gantt / Timeline, dependencies, critical path | Project steps have days and milestones, no chart | Later (US8) |
| Activity view | Notifications and Inbox, no event log | Later (needs an event log, see HANDOVER §14) |
| Box, Map, Mind Map views | No | Not planned |
| Task › Subtask | Subtasks, video clips, project sub-steps | Have |
| Checklists inside a task | No | Later (US7) |
| Priorities, assignees, due dates | Yes (one assignee + owner) | **Built** (spec 023 Stage B): Urgent / High / Normal / Low / No priority; Urgent first and notifies |
| Start dates, tags, multiple assignees | No | **Built** (spec 023 Stages B–C): workspace tags; several assignees with a lead; optional start dates, calendar spans, workload spread |
| Watchers | Followers (spec 012) | Have |
| Custom fields by task type | Sheet columns, content types | **Built** (spec 023 Stage A): field library attached to types, required from a stage, on cards, sheets and filters |
| Task types | Content types (Post, Video, Reel…) | **Built** (spec 023 Stage A): EN/AR names, icons, colours, default priority, tags and template |
| Task templates, recurring tasks | Paste plan; "standing" projects | **Built** (spec 023 Stage D): templates per type; repeat rules on publishing dates, made once per occurrence |
| Dependencies, relationships, links | No | Partly built: **Related task** field (T074–T076) and media links (spec 022); dependencies Later (US7) |
| Comments, threads, @mentions | Yes | Have |
| Assigned comments | No | Later |
| Docs (wikis, nested pages, Doc as a view) | Task briefs only | Later (US10) |
| Forms, Automations | Paste plan only | Later (US11) |
| Proofing (annotate images, PDFs, video) | Attachments with preview | Later (strong fit for D-Check) |
| Chat, Whiteboards, Clips, Meetings Hub | No | Not planned |
| Goals, Dashboards, Sprints | Aspiring / Focus plan; Overview, Capacity | Later (US9) |
| Time tracking, timesheets, estimates | Daily hours (spec 014), hour estimates | Have; per-task tracking Later |
| AI (Brain, agents, writing, summaries, standups) | No | Not planned |
| Roles Owner / Admin / Member / Guest | admin / superuser / user | Have; Guest Later |
| Integrations, API, webhooks, Drive automations | No | Not planned |
| Desktop and mobile apps | Installable web app | Have |

## Clarifications

### Session 2026-11-22

- **Q: How much does this spec deliver?**
  A: **The foundation.** Richer tasks (US7), Gantt (US8), and Sprints, Goals, Dashboards, Docs, Forms and Automations (US9–US11) each get their own spec later.
- **Q: How do custom statuses relate to the locked pipeline?**
  A: **As in the sheets (spec 019).** Teams write their own words for the pipeline stages, and each word maps to one stage. The stages, their owners, SLA and celebrations stay underneath, unchanged.
- **Q: Planning tasks don't fit the pipeline. What then?**
  A: **Two kinds of tasks.** **Pipeline tasks** are linked to the pipeline: its stages, stage owners, SLA and celebrations, as today. **Simple tasks** are not linked to it: To Do › In progress › Done, for planning, admin and event work. This needs a constitution amendment to §II before it is built.
- **Q: What happens to subtasks?**
  A: **They stay part of the model** (Task › Subtask), as today: the task panel's "New subtask" creates a real task under its parent, and video clips sit under their video.
- **Q: What do Boards show?**
  A: **The original process.** Every Board, anywhere, shows the pipeline's stages as columns in their original order, names and look. Team words never rename Board columns.
- **Q: How does the calendar work?**
  A: **As a regular calendar.** One continuous calendar per brand that keeps everything, past and future. No List per month or campaign.
- **Q: What is a Space, and what is a brand?** (This replaced the earlier answer "one Space per brand, Folders per team".)
  A: **A team Space shows one team's work across all brands.** **Brands hold the work**, each with the Folders Calendar, Assets, Sheet and Library.
- **Q: A content creator's task will become a video. How and when does it reach the Video Space?**
  A: **It shows in both Spaces.** It never leaves the Content Space. It is added to the Video Space either when a video editor (a member of the Video Space) is assigned, or at Ready For Design, when a box asks where the task should show.

### Session 2026-11-22 (planning: conflicts with the current app)

- **Q: Members at "user" access can't create tasks today. Who may create them?**
  A: **Users create their own.** A user may create tasks they own, from a team Space they belong to or from a sheet row. Admins and superusers keep creating tasks for anyone.
- **Q: Bulk moves and plan pastes can push many tasks into Ready For Design at once. What happens to those without a Design or Video Space?**
  A: **They are refused.** The bulk move or paste skips them and says "Open the task to hand it off". Other tasks still move.
- **Q: How is team Space membership set?**
  A: **Started from job roles, then editable.** Video Editor goes into Video, Graphic Designer into Design, and Content Creator and Digital Marketing Specialist into Content. Admins add or remove anyone afterwards.
- **Q: What does the Content and Video Spaces' Sheet tab show?**
  A: **Today's Content sheet and Video sheet, unchanged.** Their List, Board and Calendar show the Space's own tasks.
- **Q: How does a brand's Sheet work, given the linked sheets share one layout?**
  A: **A brand filter with shared columns.** A brand's Sheet opens today's Content and Video sheets filtered to that brand, plus the brand's own blank tabs. Columns added on the Content sheet appear for every brand.
- **Q: How private are a member's own sheet folders?**
  A: **As today.** Every member can see every folder, and anyone can edit them. My sheets is the member's pinned list.
- **Q: The names "Team" (the /team page) and "My tasks / Team tasks" (the Board toggle) already exist. How are they resolved?**
  A: **The old ones are renamed.** The /team page becomes **Plan**, and the Board toggle becomes **Mine / Everyone**. "Teams" and "My tasks" mean only the new things.
- **Q: The constitution is out of date. When is it updated?**
  A: **First.** Version 3.0.0 is this feature's first task. It covers the 11 stages as built, simple tasks and the current stack.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Brands hold the work; team Spaces show it (Priority: P1)

A member opens the sidebar. It has two sections:

- **Teams**: the team Spaces they belong to, such as Content, Design, Video and Planning. Each one shows its team's work from every brand, grouped by brand.
- **Brands**: Forefront Consulting, Omnisight, The Strategy Community, Islam Personal Branding. Each brand has the same four Folders:
  - **Calendar**: where the brand's tasks live. It is one continuous calendar, and campaigns are a filter on it.
  - **Assets**: the brand's files (logos, fonts, templates, brand guide), plus the brand's open design requests.
  - **Sheet**: the brand's workbook. It has linked tabs for its content and video tasks and blank tabs, all with today's spreadsheet experience.
  - **Library**: everything the brand has published, kept for reuse. Tasks arrive here on their own when they are published.

Every task lives in exactly one brand. A task also has a **Shows in** list of team Spaces. It appears in every Space on that list, as the same task, with the same brief, comments, files and stage.

Admins create, rename, archive and restore brands and team Spaces, and choose each Space's members. Members see the team Spaces they belong to, and every brand. Admins see everything.

On release:

- Each **brand** gets the four Folders, and its tasks go in its Calendar. Tasks with no brand go to a **"No brand"** brand.
- Each **project** (including content themes) becomes a **campaign**, which filters the calendar. Projects keep their plan on the Projects screen.
- Team Spaces **Content, Design, Video and Planning** are created. Admins add members.
- Every existing task gets a starting **Shows in** list (FR-008).

**Why this priority**: This is the structure everything else hangs on. A designer working on three brands opens one Space instead of three. A brand's whole calendar is in one place.

**Independent Test**: Open the Design Space: it lists design work from all four brands, grouped by brand. Open Forefront › Calendar: it shows every Forefront task on its day, including those in the Design Space. Change a due date in one place: the other shows it at once. The Board's "All" scope shows every task it showed before.

**Acceptance Scenarios**:

1. **Given** an admin, **When** they create a brand, **Then** it appears under Brands with Calendar, Assets, Sheet and Library, in the brand's colour.
2. **Given** a task in Forefront that shows in Content and Video, **Then** it appears in the Content Space, the Video Space and Forefront › Calendar. It is the same task, and a change made in one place shows in all three.
3. **Given** a member who isn't in the Video Space, **Then** the Video Space isn't in their sidebar. They still see the brand's tasks under Brands, as they see them on the Board today.
4. **Given** a task that is published, **Then** it appears in its brand's Library with its post link, and stays on its day in the Calendar.
5. **Given** a team Space with no members besides admins, **Then** only admins see it.
6. **Given** release day, **When** any member opens the Board, **Then** every task they could see before is still visible, in its same stage.

---

### User Story 2 - Views anywhere, and the Board always shows the original process (Priority: P1)

Any brand, Folder, team Space or **Everything** can open as:

- **List**: rows grouped by status, or by brand in a team Space;
- **Board**: the pipeline as built, always (FR-013a);
- **Sheet**: today's spreadsheet, unchanged in look and behaviour (specs 013–020);
- **Calendar**: one continuous calendar, by month or week;
- **Workload**: open work per person, as in spec 004.

Assets also opens as **Files**, and Library as a **Gallery**. Each view keeps its own filters, sorting and visible fields. Views are shared by default, and a member can save a personal one.

**Why this priority**: Views separate from structure are the second core idea of ClickUp. They let each person work the way they like on the same tasks: designers on a Board, managers on the Calendar.

**Independent Test**: In the Video Space, open Board, List, Sheet and Calendar. The Board has the 11 original columns. The List and Sheet use the Video team's words. Drag a task to another day in Forefront › Calendar: the Video Space's Calendar shows the new date. Open Everything: it lists tasks from every brand the member can see.

A member's own work sits above both, under **Me**: **My tasks** (their tasks from every brand and Space, as a Sheet, Calendar or Board) and **My sheets** (their pinned Sheets folders, free-form, as Sheets works today).

**Acceptance Scenarios**:

1. **Given** any brand, Folder or team Space, **When** a member adds a view, **Then** it shows only that node's tasks.
2. **Given** a view, **When** filters, grouping, sorting or visible fields change, **Then** the view keeps them for everyone who opens it. A member can also save a personal view.
3. **Given** a Calendar, **When** a member moves back and forward, **Then** they can reach any month or week. Today returns to the current date, and finished work stays on its day, marked done.
4. **Given** a Calendar, **When** a task is dragged to another day, **Then** its due date changes under the usual edit rules, and undo reverts it.
5. **Given** a Board anywhere, **Then** its columns are the pipeline as built, in order, with their original English and Arabic names. **When** a task is moved, **Then** the board's existing move rules apply: ownership, Published is terminal, and the celebration.
6. **Given** Noran opens My tasks as a Sheet, **When** she types "Edit" into a task's Status cell, **Then** the task moves to C-Review, and the Board, the Content Space and the brand's Calendar show it. A note she types in her own "My notes" column is seen by no one else.
7. **Given** Noran's pinned "My sheets" folder, **When** she presses "Create task" on an idea row, **Then** a task is created in that brand at To Do, shows in the Content Space and My tasks, and the row links to it.
8. **Given** today's screens, **Then** they stay at the same addresses: the Board becomes the Board view on Everything, the Content sheet the Content Space's Sheet view, and the Video sheet the Video Space's Sheet view. Each keeps its row source and grouping.

---

### User Story 3 - Each team's own status words (Priority: P1)

The Video team says "Scripting › Ready to shoot › Editing › Rough cut review › Final cut › Live". The Design team says "Brief in › Designing › Client review › Approved › Posted". Underneath, every task moves through the same pipeline.

Each team Space has **Status words**: the team's words next to each pipeline stage, separated by commas, with the first one shown. This works as it does in the sheets (spec 019).

- The words show in the Space's List, Sheet and Calendar views. Boards keep the original names.
- Typing or pasting a word into a status cell sets that stage, ignoring case and spacing.
- Brand views and Everything show the original names, because their tasks come from several teams.

**Why this priority**: It's ClickUp's custom statuses, fitted to Momentum's fixed approval chain.

**Independent Test**: In the Video Space, write "Editing" for D-In Progress and "Live" for Published. In the Video Space's Sheet, type "Live" on a task at Scheduled: on the Board it is Published, with the same celebration and SLA reset as a move on the Board. Forefront › Calendar still says "Published".

**Acceptance Scenarios**:

1. **Given** a word typed into a status cell, **When** it matches a stage's word, **Then** the task moves to that stage under the usual move rules. A word that matches nothing is refused with a message listing the valid words.
2. **Given** two words for one stage ("Live, Posted"), **Then** both set that stage, and the first is shown.
3. **Given** any team Space, **Then** stage owners, SLA, Published-is-terminal and celebrations are those of the pipeline stage.
4. **Given** the same word for two stages in one Space, **Then** saving is refused, naming the clash.
5. **Given** the Content and Video sheets' built-in words, **Then** they appear prefilled as the Content and Video Spaces' words, and can be edited.

---

### User Story 4 - Switch features on per brand (Priority: P2)

An admin opens a brand's settings and sees switches for the task features that exist today:

- Priorities
- Platform
- Content type
- Pillars
- Hour estimates
- Cover images
- Video clips
- SLA tracking
- Islam Check stage (C-Check)

Switching a feature off hides it in that brand's Folders, and on that brand's tasks wherever they show. Its data is kept, and switching it back on restores it.

**Why this priority**: It's ClickUp's "modular complexity", and it keeps a small brand simple. It needs the brands (US1) first.

**Independent Test**: Switch Platform off for The Strategy Community. Its tasks show no Platform control, in its Folders and in the team Spaces. Forefront's tasks still do. Switch it back on: the platforms set earlier are still there.

**Acceptance Scenarios**:

1. **Given** a feature switched off for a brand, **Then** no view, task panel, filter or bulk action shows it for that brand's tasks.
2. **Given** a feature switched back on, **Then** all values set before are shown again, unchanged.
3. **Given** a team Space mixing brands, **Then** a column shows values only for tasks whose brand has the feature on.
4. **Given** a new brand, **Then** it starts with the workspace's default features, which admins choose.
5. **Given** SLA tracking off for a brand, **Then** its tasks show no SLA badge and don't count as breached anywhere.
6. **Given** Islam Check switched on or off for a brand, **Then** only tasks created afterwards follow the new choice. Each existing task keeps its own.

---

### User Story 5 - Pipeline tasks and simple tasks (Priority: P1)

A content creator has two kinds of work. "Q1 outlook carousel" is a deliverable: it is written, reviewed, checked, designed, reviewed again and published. "Plan the Q1 content calendar" is not: nobody designs or approves it, and an SLA on it would only add noise.

When creating a task, the member picks its kind:

- **Pipeline task** (linked to the pipeline): its stages, stage owners, SLA, Published is final, and celebrations, exactly as today.
- **Simple task** (not linked): three statuses, **To Do › In progress › Done**. It has no stage owners, no SLA and no approval chain. Whoever may edit the task may move it.

Each team Space has a **default kind** for tasks created from it. For example, the Planning Space defaults to Simple. The member can change the kind while creating the task. After that the kind is fixed, as the C-Check choice is today.

A parent and its subtasks can be different kinds. The simple task "Ramadan launch plan" can have pipeline subtasks "Launch copy", "Launch key visual" and "Launch teaser", each with its own assignee and stage.

**Why this priority**: Without it, planning and admin work either stays outside Momentum or clutters the board and SLA figures.

**Independent Test**: From the Planning Space, create "Plan Q1 calendar". It shows To Do › In progress › Done, with no SLA badge. Add a pipeline subtask "Launch copy": it shows C-In Progress and the rest, with its SLA badge. Move the plan to Done: the subtask's stage doesn't change.

**Acceptance Scenarios**:

1. **Given** a member creating a task from a Space whose default kind is Simple, **Then** it starts as a simple task at To Do, and they could have switched it to pipeline before saving.
2. **Given** a simple task, **Then** it never shows an SLA badge, never counts as breached, and never appears in a review queue or Inbox.
3. **Given** a simple task, **When** its assignee moves it to Done, **Then** they get a celebration.
4. **Given** a saved task, **Then** its kind can't be changed.
5. **Given** a Board holding both kinds, **Then** the simple tasks sit in their own three columns after the pipeline. A Kind filter offers All, Pipeline or Simple.
6. **Given** Workload and Capacity, **Then** open simple tasks count their hour estimates. Done ones don't, as Published ones don't.
7. **Given** a parent and its subtasks, **Then** each keeps its own kind, and moving one never moves another.

---

### User Story 6 - One task, every Space it belongs to (Priority: P1)

Noran, a content creator, creates "Podcast ep. 16" for Forefront, type Video, from the Content Space. It shows in the Content Space and on Forefront's Calendar. She writes the script, and it goes through C-Review and C-Check.

A task joins a team Space in one of two ways:

- **Assigning someone from that Space.** When Karim, a member of the Video Space, is made the assignee, the task also shows in the Video Space. This can happen at any stage.
- **The hand-off box.** When the task is advanced to Ready For Design and doesn't yet show in a production Space (Design or Video), a box asks **"Where should this task show?"**:
  - Video is ticked for Video and Reel tasks, and Design for other types.
  - The member picks the assignee from the ticked Spaces' members.
  - The move completes only once at least one Space is chosen.

**The task never leaves a Space on its own.** Podcast ep. 16 stays in the Content Space after the hand-off, so Noran can follow it to the end. She is still its owner and a follower, and gets its notifications. A member who can edit the task can remove a Space from its Shows in list by hand.

**Why this priority**: This is how work passes between teams. Without it, a video editor has to go looking for scripts that are ready, and nobody knows when a hand-off happened.

**Independent Test**: As Noran, create a Video task from the Content Space and advance it to C-Check. Advance it to Ready For Design: the box appears with Video ticked, and lists Karim. Choose Karim. The task now shows in Content and Video, Karim is the assignee, and he gets an "assigned" notification. On another task, assign Karim directly at C-In Progress: it shows in the Video Space at once, with no box at Ready For Design.

**Acceptance Scenarios**:

1. **Given** a task created from a team Space, **Then** it shows in that Space. **Given** a task created from a brand's Calendar, **Then** it shows in the creator's team Space, or in the Space they choose if they belong to several.
2. **Given** a task, **When** its assignee is set to a member of a team Space, **Then** that Space is added to the task's Shows in list. No Space is removed.
3. **Given** a task advanced to Ready For Design that doesn't show in Design or Video, **Then** the hand-off box appears before the move completes, with Video ticked for Video and Reel tasks and Design for other types.
4. **Given** the box, **When** the member ticks Spaces and picks an assignee from their members, **Then** the task moves to Ready For Design, shows in the ticked Spaces, and the assignee is notified and follows it.
5. **Given** the box, **When** the member cancels, **Then** the task stays at C-Check (or the stage it was at), unchanged.
6. **Given** a task that already shows in Design or Video, **When** it reaches Ready For Design, **Then** no box appears.
7. **Given** a task shown in Content and Video, **When** it moves through the later stages, **Then** it stays in both Spaces until a member removes one by hand.
8. **Given** a member removing a Space from a task, **Then** the task leaves that Space's views only. Its brand, stage, assignee and data are unchanged.

---

### Later (own specs, recorded for direction)

- **US7 - Richer tasks**: several assignees, start dates, tags, checklists, dependencies and links, custom fields by task type, recurring tasks, templates.
- **US8 - Gantt / Timeline**: bars, dependency arrows, milestones, critical path. The project plan is drawn on it.
- **US9 - Sprints, Goals and Dashboards.**
- **US10 - Docs as a view**: a wiki of nested pages on a brand or team Space.
- **US11 - Forms and Automations.**

The structure and views in this spec must leave room for each: a view type can be added, and a feature can be added to the brand switches.

### Edge Cases

- **Existing addresses.** Bookmarked `/board`, `/board?view=sheet…` and `/sheets` links keep working and open the matching view.
- **Team sheet folders.** Today's team sheet folders stay as they are under Sheets. A brand's Sheet Folder is its own workbook. Nothing moves automatically.
- **Kinds on release day.** Every existing task becomes a pipeline task. Teams create simple tasks from then on.
- **Simple tasks on today's screens.** The Board, Content sheet and Video sheet show pipeline tasks only, as today. Simple tasks show in the new views, My tasks and Workload.
- **Brand and campaign.** Moving a task to another brand moves it to that brand's Calendar. Its campaign is cleared if the campaign belongs to the old brand. Its stage, Shows in list and data are unchanged.
- **Feature switches across brands.** Values for features switched off in the new brand are kept, not deleted, and come back if the task moves back.
- **Assignee outside every Space.** Assigning someone who belongs to no team Space adds no Space. The task still lives in its brand.
- **Member leaves a Space.** Tasks keep showing in the Space. The member stops seeing the Space; tasks assigned to them stay assigned.
- **Hand-off box on phones** is a bottom sheet. In Arabic it mirrors.
- **Followers and Spaces.** A member who follows a task in a Space they aren't in still gets its notifications. They can open the task through its brand.
- **Deleting a brand or team Space.** Only admins may, only once it is archived, and with a typed confirmation. Archiving a team Space doesn't touch tasks, which live in their brands. A deleted node stays deleted: re-running an import never brings it back.
- **Large views.** Everything and team Spaces with thousands of tasks stay usable; see SC-003.

## Requirements *(mandatory)*

### Functional Requirements

**Brands and team Spaces (US1)**

- **FR-001**: The workspace MUST hold **brands** and **team Spaces**. Each brand MUST have exactly four Folders: Calendar, Assets, Sheet and Library.
- **FR-002**: Every task MUST live in exactly one brand, in its Calendar. A subtask lives in its parent's brand.
- **FR-003**: Every task MUST have a **Shows in** list of team Spaces, and MUST appear in each of those Spaces' views as the same task.
- **FR-004**: Brands and team Spaces MUST support create, rename, reorder, archive and restore by admins. Delete MUST be admin-only, need a typed confirmation, and work only on archived nodes.
- **FR-005**: Each team Space MUST have members. On release, members are added from their job roles: Video Editor to Video, Graphic Designer to Design, and Content Creator and Digital Marketing Specialist to Content and Planning. Admins may add or remove anyone afterwards. A team Space MUST be visible only to its members and admins. Brands MUST be visible to every member, as the Board is today.
- **FR-006**: Assets MUST show the brand's files and its open design requests. Library MUST show the brand's published pipeline tasks, automatically, with their post links. Sheet MUST open today's Content and Video sheets filtered to the brand, with the same columns as the all-brand sheets, plus the brand's own blank tabs.
- **FR-007**: Campaigns (today's projects and content themes) MUST be a filter in a brand's Calendar and views, not a separate place where tasks live. Projects keep their plan on the Projects screen.
- **FR-008**: On release, every task MUST be placed in its brand's Calendar ("No brand" where it has none), and given a starting Shows in list:
  - Content, for every pipeline task;
  - plus Design, for tasks other than Video and Reel at Ready For Design or later;
  - plus Video, for Video and Reel tasks at Ready For Design or later;
  - plus Planning, for simple tasks;
  - plus every team Space its assignee belongs to.
  No task may be lost, duplicated, or changed in stage, owner, dates or SLA clock. Running the placement twice MUST change nothing.

**Views (US2)**

- **FR-009**: A member MUST be able to open List, Board, Sheet, Calendar and Workload views on any brand, brand Folder, team Space and Everything. Assets MUST also open as Files, and Library as a Gallery.
- **FR-010**: Each view MUST keep its own filters, grouping, sorting, visible fields and column order. Views MUST be shared by default. A member MAY save a personal view only they see.
- **FR-011**: Every view MUST change tasks only through the same rules as the board: stage ownership, Published is terminal, celebrations and SLA reset. No view type MAY add a way around them.
- **FR-012**: Today's Board, Content sheet and Video sheet MUST stay reachable at their current addresses and behave as they do now. The Content Space's Sheet tab MUST be today's Content sheet, and the Video Space's Sheet tab today's Video sheet, unchanged. Their other views show the Space's own tasks.
- **FR-012a**: The /team page MUST be renamed **Plan**, and the Board's scope toggle **Mine / Everyone**. Their behaviour doesn't change.
- **FR-013**: The Everything view MUST list every task the member may see, and only those.
- **FR-013a**: Every Board view, everywhere, MUST show the pipeline as built: its stages as columns in their original order, with their original English and Arabic names and look, exactly as today's Board. Status words MUST NOT rename Board columns. Simple tasks, when shown, sit in their own three columns after the pipeline.
- **FR-013b**: Each member MUST have **My tasks**: every task assigned to them, plus every task they own that someone else is now working on, across all brands and team Spaces. It MUST open as Sheet, Calendar and Board, with a filter: All mine, Assigned to me, Handed off. Regular columns a member adds to their My tasks Sheet (such as "My notes") belong to that member only.
- **FR-013c**: A member's pinned Sheets folders MUST show in the sidebar under **Me**, above Teams and Brands. Folder visibility and editing stay as today. They open today's Sheets workbook unchanged: blank, unlinked tabs, formatting, keyboard, tab management. As today (specs 016 and 019), a row can be linked to a task, or turned into a new task with one click, and the row stays linked.
- **FR-014**: The Calendar MUST be one continuous calendar, as a regular calendar is: every task with a date sits on its day, past and future. Members move back and forward through any month or week, and Today returns to the current date. Finished work stays on its day, marked done. Campaigns are a filter, not separate Lists. Dragging a task to a day sets its due date, and tasks without a date are listed apart.
- **FR-014a**: The Sheet view MUST be the existing spreadsheet, not a new or simpler table. It keeps its menu bar and toolbar, name box, cell editing, keyboard navigation, copy and paste (including from Excel and Google Sheets), formatting, merges, frozen panes, sort and filter, comments, multi-area selection, the power tips, and the Fields drawer with task field and regular columns.

**Status words (US3)**

- **FR-015**: Each team Space MUST be able to hold status words: for each pipeline stage and simple status, zero or more words, with the first shown. Admins and superusers MAY edit them; users MAY NOT.
- **FR-016**: A team Space's List, Sheet and Calendar views MUST show its words. Brand views, Everything and every Board MUST show the original names.
- **FR-017**: Typing, pasting or filling a word into a status cell MUST set the mapped stage, ignoring case and spacing, under the usual move rules. Unknown words and words used for two stages MUST be refused.
- **FR-018**: The pipeline stages, their owners, SLA thresholds, Published-is-terminal and celebrations MUST stay unchanged and apply through the mapping (constitution §II, §V). Words change only what is shown and typed.

**Per-brand features (US4)**

- **FR-019**: Each brand MUST have on/off switches for: Priorities, Platform, Content type, Pillars, Hour estimates, Cover images, Video clips, SLA tracking, and the Islam Check stage.
- **FR-020**: Switching a feature off MUST hide it for that brand's tasks everywhere, including team Spaces, and MUST keep its data. Switching it back on MUST restore that data unchanged.
- **FR-021**: Admins MUST be able to set the default features for new brands. Only admins MAY change a brand's switches.

**Task kinds (US5)**

- **FR-022**: Every task MUST be either a pipeline task (the pipeline stages, owners, SLA, celebrations, Published is final) or a simple task (To Do › In progress › Done). The kind MUST be chosen at creation and MUST NOT change afterwards.
- **FR-023**: Each team Space MUST have a default kind for tasks created from it, set by admins. New Spaces default to Pipeline.
- **FR-024**: Simple tasks MUST have no SLA, no stage owners and no approval steps. Any member who may edit the task MAY change its status. Moving one to Done MUST celebrate for its assignee.
- **FR-025**: A subtask's kind MUST be independent of its parent's. Changing one task's status MUST NOT change another's.
- **FR-026**: Workload and Capacity MUST count open simple tasks' hour estimates. SLA figures, review queues and the Library MUST leave simple tasks out.
- **FR-027**: On release, every existing task MUST become a pipeline task.

**Shows in and the hand-off (US6)**

- **FR-027a**: A member at user access MAY create tasks they own, from a team Space they belong to, from a brand, or from a sheet row. Admins and superusers MAY create tasks for anyone, as today.
- **FR-028**: A task created from a team Space MUST show in that Space. A task created from a brand MUST show in the creator's team Space, or in the one they choose if they belong to several.
- **FR-029**: Setting a task's assignee to a member of a team Space MUST add that Space to the task's Shows in list. A Space whose default kind is Simple (such as Planning) is added this way only for simple tasks. Changing the assignee MUST NOT remove any Space.
- **FR-030**: Moving a pipeline task from before Ready For Design to Ready For Design or later MUST open the hand-off box when the task shows in no production Space. This applies to every one-task path: Advance, the stage menu, Board drag, Inbox and a sheet cell. The box MUST:
  - pre-tick Video for Video and Reel tasks, and Design otherwise;
  - require at least one Space and an assignee from the ticked Spaces' members;
  - complete the move only on confirm, and leave the task unchanged on cancel.
- **FR-030a**: Bulk moves and plan pastes MUST refuse every task that would need the hand-off box. They MUST name how many tasks were refused and say "Open the task to hand it off", and still apply the other tasks. A pasted plan row that would create a new task at Ready For Design or later, without a production Space, MUST be skipped the same way.
- **FR-031**: Confirming the hand-off MUST move the task, add the ticked Spaces, set the assignee, and notify the assignee and make them a follower, as assigning does today.
- **FR-032**: A task MUST NOT leave a team Space automatically. A member who may edit the task MAY remove a Space from its Shows in list by hand.
- **FR-033**: Which team Spaces count as production Spaces for the hand-off (Design and Video to start) MUST be an admin setting.

**Cross-cutting**

- **FR-034**: Every new screen, view and control MUST be available in English and Arabic, with right-to-left layout.
- **FR-035**: Every change that creates, moves or edits tasks, brands or Spaces MUST have its permission checked before it takes effect, whatever screen it comes from.
- **FR-036**: Every view MUST be usable on a phone-width screen.
- **FR-037**: The parity map in this spec MUST be kept current as later specs (US7–US11) ship.

### Key Entities

- **Workspace**: the whole company. Holds members, brands, team Spaces and default features.
- **Brand**: where work lives. Name, colour, logo, feature switches, its four Folders, and its campaigns.
- **Brand Folder**: Calendar, Assets, Sheet or Library. Fixed, one of each per brand.
- **Campaign**: today's project or content theme, used as a filter in a brand's views.
- **Team Space**: a lens on one team's work across brands. It has a name, colour, members, status words, a default kind, saved views, and whether it is a production Space.
- **Shows in**: the team Spaces a task appears in.
- **Status words**: for one team Space, the words written for each pipeline stage and simple status.
- **View**: a saved way of looking at a node: type, name, filters, grouping, sort, visible fields, and shared or personal.
- **Task**: as today, plus its brand, its Shows in list, and its **kind** (pipeline or simple), fixed at creation. Subtasks stay as today.
- **Brand asset**: a file belonging to a brand, as today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After release, 100% of existing tasks are in a brand's Calendar, and the count of tasks visible to each member on the Board is the same as before.
- **SC-002**: A designer finds all of their open design work across every brand in one place, their Design Space, in under 10 seconds.
- **SC-003**: A view of up to 5,000 tasks opens and shows its first screen of results in under 2 seconds, and scrolling stays smooth.
- **SC-004**: In a test with each member role, 0 team Spaces appear for members who aren't in them.
- **SC-005**: Switching a feature off and on again for a brand loses 0 values.
- **SC-006**: Within 4 weeks of release, at least two teams have written their own status words, and 0 tasks have skipped a stage owner's approval because of them.
- **SC-007**: 100% of pipeline tasks that reach Ready For Design show in a production Space with an assignee, and their assignee is notified.
- **SC-008**: Within 4 weeks of release, planning and admin work is created as simple tasks, and 0 simple tasks appear in SLA figures or review queues.
- **SC-009**: 90% of members asked after 2 weeks can find a given brand's calendar and a given team's work on the first try.

## Assumptions

- **Scope.** This spec covers US1–US6. US7–US11 get their own specs. AI features, Chat, Whiteboards, Clips, Meetings, Box, Map and Mind Map views, third-party integrations and webhooks are not planned.
- **Four fixed Folders.** Every brand has exactly Calendar, Assets, Sheet and Library. Brands can't add Folders in this spec.
- **Library fills itself.** It lists published pipeline tasks automatically; nobody curates it by hand.
- **A sheet per brand.** Each brand's Sheet Folder shows today's Content and Video sheets filtered to the brand, sharing their columns, plus the brand's own blank tabs. The all-brand Content and Video sheets are the Content and Video Spaces' Sheet tabs, at their current addresses.
- **"Video editor role" means membership of the Video Space**, which starts from the member's job role (FR-005) and is then editable. Job roles still decide who owns review stages.
- **Starting Spaces.** Content, Design, Video and Planning are created on release. Admins add members and may add more Spaces.
- **Roles.** The three tiers (admin, superuser, user) stay. A **Guest** role for outside clients is out of scope; it needs its own security review.
- **The content pipeline stays intact.** Every pipeline task runs on the pipeline stages. Words can't skip or reorder stages. Only the per-brand Islam Check switch removes a stage, as today's C-Check choice does.
- **Constitution 3.0.0 first.** This feature's first task updates the constitution. It covers the 11 stages as built, simple tasks as a second workflow (§II), the Done celebration (§V), users creating their own tasks (§III), and the current stack (Next.js 16, Prisma and Postgres, the custom session, no Supabase or row-level security).
- **Subtasks.** They stay as today: a subtask is a real task under a parent, in its parent's brand. It has its own Shows in list.
- **Nine-stage choice.** It moves from a single workspace setting to a per-brand switch. The workspace value becomes the default, and each task's choice stays fixed at creation.
- **Today's screens stay.** Overview, Board, Projects, Team, Capacity, Hours, Settings and Sheets keep working. Nothing is removed in this spec.
- **Visual style.** New screens use Momentum's existing light theme and design tokens (constitution §I): ink text, the dark navigation rail, lime for primary actions, coral for danger and SLA, violet and cyan as accents, Montserrat headings and Inter body text. Brands show their colour, and stages keep the Board's colours. The Sheet view keeps the spreadsheet's own look. A dark theme is not part of this spec.
- **Design-driven development.** The sidebar, views, Calendar, hand-off box, Status words and brand settings follow the design file (constitution §IV). The preview linked above is its first version.
- **Data safety.** As with the importers, placing work into brands and Spaces only creates, never overwrites what exists. It is safe to run twice.
