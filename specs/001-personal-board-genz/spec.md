# Feature Specification: Personal Board — GenZ Redesign

**Feature Branch**: `001-personal-board-genz`

**Created**: 2026-07-15

**Status**: Draft

**Input**: Design file `6c0ca5ca-Fluxo_Personal_Board_GenZ.html` — the new
GenZ-style personal dashboard for Fluxo Creative Ops.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — At-a-Glance Personal Dashboard (Priority: P1)

A team member logs in and immediately sees their personal command center:
greeting headline, four stat cards (overdue tasks, tasks in progress,
published this week, weekly capacity used), a dark capacity bar, and task
panels for "My Day" (due today / overdue) and "Up Next" (due this week).

**Why this priority**: This is the first screen every user sees. It MUST
deliver actionable status without any extra navigation.

**Independent Test**: A logged-in user can see all four stat cards, the
capacity bar, and at least one task panel populated with their own tasks
without clicking anything.

**Acceptance Scenarios**:

1. **Given** the user has tasks assigned to them, **When** they open the
   Overview tab, **Then** they see a greeting ("Good morning, [name]"),
   four BigStat cards, a weekly capacity bar, and their tasks split into
   "My Day" and "Up Next" panels.
2. **Given** the user has no tasks due today, **When** they view "My Day",
   **Then** the panel shows an empty-state message (not an error).
3. **Given** the user's capacity is 40 hrs/wk and 28 hrs are logged,
   **When** they view the capacity bar, **Then** it shows 70% fill with a
   lime-to-violet gradient and the numbers 28/40 hrs.

---

### User Story 2 — Task Alert Status (Priority: P2)

Each task in the personal panels displays a real-time alert badge computed
from SLA and due-date data: "On Track", "At Risk", "Will Miss", "Stuck",
"Idle", or "Overdue". Users understand at a glance which tasks need
attention.

**Why this priority**: Without alert status, the panels are just a list.
Alert badges make the dashboard actionable and drive the right behaviour.

**Independent Test**: A task that is past its due date shows an "Overdue"
badge in red; a task on time shows "On Track" in green.

**Acceptance Scenarios**:

1. **Given** a task whose due date has passed, **When** it appears in a
   panel, **Then** it shows a red "Overdue" badge.
2. **Given** a task in a stage longer than its SLA threshold, **When** it
   appears, **Then** it shows an amber "At Risk" or red "Will Miss" badge
   based on remaining calendar days.
3. **Given** a task with no activity in more than 2 days, **When** it
   appears, **Then** it shows an "Idle" badge.

---

### User Story 3 — Profile Section & Team Digest (Priority: P3)

Above the stat cards, the user sees a profile strip (their name, role, and
access badge). Below the task panels, a team digest shows each team
member's current workload and status (Available / Busy), visible to all
users but with capacity edit controls only shown to admins.

**Why this priority**: Team awareness is secondary to personal task focus,
but important for coordination.

**Independent Test**: A non-admin user sees team member cards but cannot
edit capacity values. An admin user sees inline capacity edits.

**Acceptance Scenarios**:

1. **Given** any logged-in user, **When** they scroll to the team digest,
   **Then** they see all members with name, role, status dot, and active
   task count.
2. **Given** an admin user, **When** they view a member card, **Then** they
   see an inline capacity field they can edit.
3. **Given** a non-admin user, **When** they view a member card, **Then**
   capacity is read-only.

---

### Edge Cases

- What happens when a user has zero tasks assigned? (Empty state per panel,
  stat cards show 0.)
- What happens when weekly capacity is not set for a member? (Capacity bar
  shows 0/— hrs, no percentage.)
- What happens when all tasks are published? (Dashboard celebrates with a
  "you're all caught up" message.)
- How does the greeting change across morning / afternoon / evening?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Overview tab MUST display a time-sensitive greeting
  (Good morning / afternoon / evening) with the current user's first name.
- **FR-002**: Four BigStat cards MUST be shown: (1) overdue tasks count in
  danger theme, (2) in-progress tasks count in accent theme, (3) published
  this week in lime theme, (4) weekly capacity percentage in default theme.
- **FR-003**: Each BigStat card MUST use the themed gradient background
  defined in the constitution design token system (danger, accent, lime,
  default).
- **FR-004**: A dark capacity bar MUST display hours logged vs. weekly
  capacity with a lime-to-violet fill gradient, numeric labels, and a
  percentage.
- **FR-005**: "My Day" panel MUST show tasks assigned to the current user
  that are due today or already overdue (sorted by due date asc).
- **FR-006**: "Up Next" panel MUST show tasks assigned to the current user
  due within the next 7 days (excluding today / overdue), sorted by due
  date asc.
- **FR-007**: Each task row in a panel MUST display: stage colour dot,
  content-type emoji, task name, alert status badge, and due date.
- **FR-008**: Alert status MUST be computed in real time from SLA config
  and due date; it MUST NOT be stored on the task record.
- **FR-009**: Clicking a task row MUST open the TaskModal for that task
  (reuse existing `selectTask` store action).
- **FR-010**: A profile strip MUST show the current user's name, role, and
  access-level badge (Admin = lime, Super User = violet, User = neutral).
- **FR-011**: The team digest section MUST list all members with: avatar
  initials (coloured by member `bg`), name, role, status dot
  (Available = lime, Busy = coral), and count of active (non-published)
  tasks.
- **FR-012**: Capacity edit controls in team digest MUST be visible only to
  admin users; non-admins see a read-only value.
- **FR-013**: The component MUST render within the existing `AppShell`
  layout without modifying `App.tsx` routing or sidebar.

### Key Entities

- **Task**: id, name, assignee, status (StageId), due (YYYY-MM-DD),
  stageDate (YYYY-MM-DD), ctype (ContentType), hours — sourced from Zustand.
- **Member**: name, role, access, color, bg, capacity (hrs/wk), status —
  sourced from Zustand `members`.
- **AlertStatus**: derived enum (On Track / At Risk / Will Miss / Stuck /
  Idle / Overdue) — computed from task due date + SLA config, never stored.
- **SLAConfig**: per-stage day limits — sourced from Zustand `slaConfig`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The personal dashboard loads and renders all four stat cards
  within the time the rest of the page content appears (no extra spinner).
- **SC-002**: A user with 10 assigned tasks sees the correct split between
  "My Day" and "Up Next" panels with zero manual filtering needed.
- **SC-003**: Alert badges are visually distinct; a user can identify the
  most urgent task in under 3 seconds by scanning the panel.
- **SC-004**: The team digest shows accurate active-task counts for every
  member (verified by cross-checking with the Kanban Pipeline view).
- **SC-005**: Admin capacity edit saves immediately on blur/enter with no
  page reload required.
- **SC-006**: The component matches the GenZ design file to pixel-level
  fidelity for color, typography, and layout as established in Constitution
  Principle IV.

## Assumptions

- Task hours logged is inferred from `task.hours` already stored on each
  task record; there is no separate time-tracking system yet.
- "Weekly capacity used" counts hours of all active (non-published) tasks
  assigned to the current user this week, not a time-tracker value.
- The design replaces the current `PersonalBoard.tsx` entirely; no
  backward-compatibility shim for the old purple My Board design is needed.
- Content-type emojis follow the existing mapping in the codebase
  (Post→📝, Video→🎬, Reel→📱, Design→🎨, Email→📧, Story→✨, Deck→📊, Other→📦).
- Platforms (LinkedIn, Instagram, TikTok, Facebook) are displayed as the
  branded SVG icons already present in the design system.
- All date calculations use the existing `differenceInDays` pattern already
  in the codebase (or plain JS date arithmetic for the standalone design).
