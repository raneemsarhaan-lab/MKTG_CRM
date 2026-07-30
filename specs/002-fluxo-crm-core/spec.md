# Feature Specification: Fluxo — Content Operations CRM (Core)

**Feature**: `002-fluxo-crm-core`

**Created**: 2026-07-15

**Owner**: Raneem (Marketing Manager & Creative Lead, Forefront Consulting)

**Status**: Active build

---

## What this is

Fluxo is a single, agency-owned workspace where Forefront Consulting plans,
produces, reviews, and publishes content across all four client brands. It
replaces scattered tools and informal hand-offs with one enforced workflow —
giving every team member a clear view of what they own, what is blocking, and
what has shipped.

This specification covers the **core product** end-to-end: the production
pipeline, task model, access control, personal dashboard, capacity view,
settings, celebration system, and bilingual interface.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Content executor completes their stage (Priority: P1)

A Content Creator, Graphic Designer, or Video Editor logs in, sees their
assigned tasks in "My Day", opens a task card, completes their work, and
advances the task to the next stage. A celebration fires for that person only.

**Why this priority**: This is the core daily loop for the majority of users.
Everything else in the tool exists to support this moment.

**Independent Test**: A User-tier member can advance a task they own from one
stage to the next. A celebration fires. They cannot advance a task owned by
someone else.

**Acceptance Scenarios**:

1. **Given** a Content Creator is assigned a task in Writing stage, **When**
   they mark the work complete and advance the task, **Then** the task moves
   to Content Review, the celebration overlay fires for that user, and the
   card on the Kanban board reflects the new stage immediately.
2. **Given** a Content Creator views the Kanban board, **When** they look at
   a task in Design Review, **Then** they cannot advance it (no advance
   button appears, or it is disabled).
3. **Given** any user, **When** they try to move a task out of Published,
   **Then** the action is blocked with no option to do so.

---

### User Story 2 — Reviewer approves and passes the task (Priority: P1)

The Marketing Manager, Managing Director, or Brand Director sees tasks
waiting in their review stage, opens the card, reviews the content, and
advances (or returns) the task. The next person in the chain is notified via
the board state.

**Why this priority**: Review stages are the bottleneck in every content
workflow. Making this fast and unambiguous is the second most critical job of
the tool.

**Acceptance Scenarios**:

1. **Given** a task is in Content Review, **When** the Marketing Manager opens
   the board, **Then** the task is visually attributed to them (stage
   ownership shown on the card) and they can advance it to Islam Check.
2. **Given** a Super User opens the board, **When** any task is at any stage,
   **Then** they can advance it regardless of stage ownership — bypassing the
   normal ownership check.
3. **Given** the Islam Check stage, **When** the Managing Director is not
   available, **Then** an Admin or Super User can still advance the task.

---

### User Story 3 — Admin creates and configures a task (Priority: P1)

The Marketing Manager creates a new task, assigns it a brand, content type,
channel, owner, and due date, and the card appears immediately in the pipeline
at the "To Do" stage.

**Acceptance Scenarios**:

1. **Given** the admin fills the task creation form, **When** they submit it,
   **Then** the card appears in the "To Do" column with the correct brand
   badge, content type, channel icon, assignee avatar, and due-date countdown.
2. **Given** a task is created, **When** the admin assigns it to a person
   whose role matches a working stage, **Then** the card shows both the task
   owner (fixed) and the current stage owner (derived from the current stage).

---

### User Story 4 — Team member monitors their workload (Priority: P2)

A team member opens the Overview (personal dashboard) and immediately sees
which tasks need their attention today ("My Day") and what is coming up next
("Up Next"). No filtering or searching required.

**Acceptance Scenarios**:

1. **Given** a user logs in, **When** they view the Overview tab, **Then**
   they see a personal greeting, stat summary cards, tasks due today in
   "My Day", and tasks due this week in "Up Next".
2. **Given** a task is overdue, **When** it appears in "My Day", **Then** it
   carries a red "Overdue" status badge.
3. **Given** a task's time in the current stage exceeds its SLA limit,
   **When** it appears in any panel, **Then** it carries a visible alert badge
   (At Risk, Will Miss, or Stuck) matching severity.

---

### User Story 5 — Admin monitors team capacity (Priority: P2)

The Marketing Manager opens the Capacity Dashboard and sees each team
member's current workload vs. their weekly capacity limit, making it easy to
spot who is overloaded before it becomes a missed deadline.

**Acceptance Scenarios**:

1. **Given** the admin opens the Capacity tab, **When** they view member
   cards, **Then** each card shows the member's active task count, hours
   assigned, capacity limit, and a visual fill bar.
2. **Given** a member has more hours assigned than their capacity limit,
   **When** the admin views that member's card, **Then** the fill bar is
   visually flagged (e.g., coral/red colour).
3. **Given** a non-admin user navigates to the Capacity tab, **Then** the tab
   is not shown in the sidebar and the URL is not accessible.

---

### User Story 6 — Admin configures the workspace (Priority: P3)

The Marketing Manager adds or removes team members, adjusts stage ownership
per person, adds a new brand, changes SLA thresholds per content type, and
updates capacity hours — all from within the Settings page, with no
technical knowledge required.

**Acceptance Scenarios**:

1. **Given** the admin opens Team Settings, **When** they add a new member
   with a role, **Then** the member appears in the Kanban assignee list and
   can be assigned tasks immediately.
2. **Given** the admin removes a member, **Then** the system surfaces a
   warning if that member owns active tasks and prompts reassignment before
   removal.
3. **Given** the admin opens Workflow Settings, **When** they change the SLA
   value for Video in the "Writing" stage, **Then** all existing and future
   Video tasks use the new SLA threshold immediately.
4. **Given** a non-admin user opens Settings, **Then** the page shows a
   read-only view (or is not accessible).

---

### Edge Cases

- What happens when the same person holds both the task-owner role and the
  current stage-owner role? (Advance is allowed; celebration fires.)
- What happens if a member is removed who holds a review-stage role?
  (Warn before removal; require reassignment.)
- What happens if a content type is deleted that has active tasks?
  (Tasks retain the old type label; deletion is blocked or flagged.)
- What happens if Islam Check is reached and no Managing Director is
  assigned? (Task remains; Super User/Admin may advance.)
- What if a task has no cover image? (Gradient fallback rendered from brand
  colour.)
- What if the same task card is open in two browser tabs? (Last write wins;
  no merge conflict handling required at this stage.)

---

## Requirements *(mandatory)*

### Functional Requirements

**Pipeline & Task Movement**

- **FR-001**: Tasks MUST progress through 9 ordered stages: To Do → Writing
  → Content Review → Islam Check → Ready to Design → Designing →
  Design Review → Final Check → Published.
- **FR-002**: The Published stage MUST be terminal; no user of any tier can
  advance a task out of it.
- **FR-003**: A User-tier member MUST only be able to advance a task when
  they are the current stage owner for that task's current stage.
- **FR-004**: Admin and Super User tier members MUST be able to advance any
  task at any stage, bypassing stage-ownership checks.
- **FR-005**: Tasks created by a **Content Creator** role MUST follow the
  full 9-stage path (including Islam Check). Tasks created by any other role
  (Admin, Super User, other User roles) MUST follow the 8-stage path,
  skipping Islam Check and advancing directly from Content Review to Ready
  to Design. Each task MUST carry a `nineStage` boolean flag (set at creation
  based on the initiator's role) that determines which path it takes; this
  flag is immutable after creation.
- **FR-006**: Stage ownership MUST be stored as roles, not person names.
  Removing or renaming a person MUST NOT break ownership assignments.
- **FR-007**: Each task MUST carry a fixed task owner (set at creation) and a
  derived current stage owner (auto-resolved from the stage's owning role to
  the matching team member).
- **FR-008**: Moving a task forward MUST update the stage immediately and
  visibly on the Kanban board for all users viewing it.

**Task Cards & Kanban Board**

- **FR-009**: The Kanban board MUST display 9 columns, one per stage, with
  tasks as draggable cards that can be repositioned via drag-and-drop.
- **FR-010**: Each task card MUST display: brand monogram badge, content type,
  channel/platform icon, task owner avatar, current stage owner avatar, and
  a due-date countdown.
- **FR-011**: Cards without a cover image MUST display a gradient fallback
  derived from the task's brand colour.
- **FR-012**: The board MUST show a stat strip summarising total tasks,
  tasks in progress, and tasks due today.
- **FR-013**: Clicking a card MUST open a task detail modal showing all
  attributes, comments/activity log, and the option to advance the task.

**Task Creation**

- **FR-014**: Any user with Admin or Super User access MUST be able to create
  new tasks. User-tier members MAY create tasks if the task type they are
  creating falls within their working stage. [Assumption: Users cannot create
  tasks; only Admin/Super User can. If otherwise, update this.]
- **FR-015**: Task creation MUST require: brand, content type, channel,
  task owner, and due date. Cover image is optional.
- **FR-016**: A new task MUST enter the pipeline at the "To Do" stage with
  today as its stage-entry date.

**Celebration System**

- **FR-017**: A celebration overlay MUST fire when a user advances a stage
  that they personally own, not when an Admin/Super User overrides on their
  behalf.
- **FR-018**: The overlay MUST present four Arabic celebration reactions
  (زغروطة, تسقيف, انا مبهور بيا, طبلة), each with a distinct animated
  confetti effect and synthesized audio.
- **FR-019**: The user MUST be able to dismiss the overlay and select their
  reaction; a reaction fires the corresponding audio and confetti.

**Personal Dashboard (Overview)**

- **FR-020**: The Overview tab MUST be the default landing page after login.
- **FR-021**: "My Day" panel MUST show only tasks assigned to the current user
  that are due today or already overdue, sorted by due date ascending.
- **FR-022**: "Up Next" panel MUST show tasks assigned to the current user
  due within the next 7 calendar days (excluding today/overdue), sorted by
  due date ascending.
- **FR-023**: Each task in a panel MUST display a real-time alert badge:
  On Track, At Risk, Will Miss, Stuck, Idle, or Overdue — derived from SLA
  config and due date, never stored on the task.

**SLA & Alerting**

- **FR-024**: Each stage + content-type combination MUST have a configurable
  SLA threshold (in business days).
- **FR-025**: A task exceeding its SLA threshold MUST display an alert badge
  on the card and in personal panels without any manual action.

**Capacity Dashboard (Admin only)**

- **FR-026**: The Capacity Dashboard MUST be visible only to Admin-tier users.
- **FR-027**: The dashboard MUST display, per team member: active task count,
  total hours assigned, weekly capacity limit, and a fill bar showing
  utilisation percentage.
- **FR-028**: Members over 100% utilisation MUST be visually flagged with a
  distinct colour (coral/red) on their capacity bar.

**Settings**

- **FR-029**: Settings MUST be accessible only to Admin-tier users.
- **FR-030**: Team Settings MUST support: adding/removing members, editing
  role and capacity hours, and assigning stage ownership per member.
- **FR-031**: Removing a member who owns active tasks MUST surface a warning
  and require reassignment before the removal completes.
- **FR-032**: Workflow Settings MUST support: adding/removing brands (with
  colour), adding/removing content types, editing the SLA matrix.
- **FR-033**: All settings changes MUST take effect immediately with no
  page reload or deploy step required.

**Bilingual Interface**

- **FR-034**: All stage labels MUST appear in both English and Arabic on
  task cards and the Kanban board headers.
- **FR-035**: The celebration overlay copy MUST be in Arabic.
- **FR-036**: The interface MUST support right-to-left text rendering for
  Arabic strings without breaking the layout.

**Authentication & Access**

- **FR-037**: Login MUST be restricted to email addresses belonging to the
  `@forefront.consulting` domain.
- **FR-038**: After login, the system MUST determine the user's access tier
  from their email/role record and enforce it for the session.

---

### Key Entities

| Entity | Key Fields | Notes |
|--------|-----------|-------|
| Task | id, name, brand, ctype, platform, taskOwner, status (stage), stageDate, due, hours, coverImage, comments[] | `status` drives derived `stageOwner` |
| Member | name, role, access (admin/superuser/user), capacity (hrs/wk), status (Available/Busy) | Stage ownership stored on member record as role |
| Brand | name, colour | 4 seed brands; admin-configurable |
| ContentType | label | Post, Video, Reel, Design, Email, Story, Deck, Other; admin-configurable |
| Stage | id, label (EN), label (AR), phase, ownerRole, terminalFlag | 9 stages; ownerRole links to Member.role |
| SLAConfig | stageId + contentType → maxBusinessDays | Admin-configurable per stage × content type |
| Comment | taskId, author, text, timestamp | Append-only |

---

## Success Criteria *(mandatory)*

- **SC-001**: A team member can open the app, find their assigned tasks, and
  advance their stage without any guidance or training — within 2 minutes of
  first use.
- **SC-002**: No task advances past a review stage without being seen by the
  designated stage owner (enforced via the ownership model).
- **SC-003**: The Kanban board reflects the current state of all tasks
  within one page refresh or real-time update; no stale stage information
  is visible.
- **SC-004**: The SLA alert system surfaces at-risk tasks before their due
  date; zero tasks enter overdue status without having first appeared in
  "At Risk" or "Will Miss" state.
- **SC-005**: The Admin can add a new team member, brand, or content type
  and have it available across the tool within one action — no restarts,
  deploys, or file edits.
- **SC-006**: The celebration system fires for at least 95% of eligible
  stage advances (no silent failures); the audio plays on all major browsers
  used by the team.
- **SC-007**: The tool works with no terminal, no build tools, and no Node
  knowledge required for day-to-day operation and configuration by the Admin.
- **SC-008**: Permissions are meaningful — a User-tier member cannot advance
  stages they do not own, even if they inspect the network traffic or
  manipulate the UI.

---

## Assumptions

- Task creation is Admin/Super User only by default; if User-tier creation is
  needed, a separate feature spec will cover it.
- The 8/9-stage variant is determined by the initiator's role at task
  creation. A `nineStage: boolean` flag is set once (true if the creator is a
  Content Creator, false otherwise) and is immutable for the life of the task.
- Cover images are uploaded externally and referenced by URL, or left blank
  for the gradient fallback; no in-app image upload is in scope for this spec.
- Real-time multi-user collaboration (live cursor, instant board sync) is out
  of scope; page refresh is the synchronisation mechanism until the Supabase
  realtime integration is wired.
- Permissions are currently UI-enforced only; backend database enforcement
  (Supabase RLS) is a separate future spec and is not a blocker for the
  current build.
- Email notifications, push notifications, and @mentions are out of scope.
- Mobile-responsive layout is a bonus but not a primary requirement; the tool
  is designed for desktop/laptop use.
