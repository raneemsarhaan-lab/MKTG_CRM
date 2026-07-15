# Tasks: Fluxo CRM Core

**Input**: Design documents from `specs/002-fluxo-crm-core/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not requested — omitted per plan.md. Verification steps are included for RLS/security tasks only.

**Note on stack migration**: The current codebase is React + Vite. This task list implements the Next.js App Router rewrite described in plan.md. Existing Vite code is the reference; tasks do not delete it until the new shell is stable.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies on incomplete tasks)
- **[Story]**: Maps to user story from spec.md (US1–US6)
- Refs cite the relevant spec FR or plan section

---

## Phase 1: Scaffold + Google Auth

**Purpose**: Stand up a working Next.js shell with Google OAuth restricted to `@forefront.consulting`. Nothing else can be built until a session is established server-side.

**⚠️ CRITICAL**: No board, dashboard, or settings work can begin until login and AppShell are working end-to-end.

- [x] T001 Convert repo from Vite to Next.js 15 — update `package.json` scripts, install `next`, create `next.config.ts`, and replace `vite.config.ts`; keep existing `src/` files intact as reference; update `tsconfig.json` to `"moduleResolution": "bundler"` and add `paths` alias for `@/`
  > *Ref: plan.md Phase 0, plan.md Technical Context*

- [x] T002 [P] Create `src/app/globals.css` with all Fluxo design tokens as CSS variables (ink, rail, lime, coral, violet, cyan, mint, muted, soft, panel, line) and Google Fonts `@import` for Montserrat (700, 800, 900), Inter (400, 500, 600, 700), and Caveat (600, 700); create `src/lib/tokens.ts` with the same values as typed TypeScript constants
  > *Ref: plan.md Design Token Layer, constitution.md §I Design System Fidelity*

- [x] T003 [P] Create `src/types/index.ts` with complete TypeScript type surface: `StageId`, `AccessLevel`, `AlertStatus`, `Priority`, `Member`, `Brand`, `ContentType`, `Stage`, `SLAConfig`, `Task`, `TaskComment`, `TaskAttachment`, `PanelTask`, `BigStatMetric`, `CelebrationPayload`, `UIStore`
  > *Ref: data-model.md TypeScript Types, plan.md §Types*

- [x] T004 Create `src/lib/supabase/server.ts` (createServerClient using `@supabase/ssr` cookie adapter) and `src/lib/supabase/client.ts` (createBrowserClient singleton); install `@supabase/ssr` and `@supabase/supabase-js`; add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local.example`
  > *Ref: plan.md Phase 0, contracts/server-actions.md Auth Flow*

- [x] T005 Create `src/app/(auth)/login/page.tsx` — server component rendering a Google OAuth sign-in button that calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`; style with Fluxo tokens (lime CTA, ink background); show error messages for `?error=domain`, `?error=not_member`, `?error=auth_failed`
  > *Ref: plan.md Phase 0, spec.md FR-037, quickstart.md Scenario 1*

- [x] T006 Create `src/app/auth/callback/route.ts` — exchange OAuth code for session, check email ends in `@forefront.consulting` (sign out + redirect to `/login?error=domain` if not), look up `members` table by email (redirect to `/login?error=not_member` if absent), redirect to `/overview` on success
  > *Ref: plan.md Auth Flow, contracts/server-actions.md Auth Flow, spec.md FR-037–FR-038, research.md Decision 10*

- [x] T007 Create `src/middleware.ts` (Next.js requires middleware at the `src/` root, not inside `app/`) — read Supabase session cookie on every request to `/(app)/**`; redirect unauthenticated requests to `/login`; allow `/login`, `/auth/**`, and static assets through without auth check
  > *Ref: plan.md Phase 0, spec.md FR-037*

- [x] T008 Create `src/app/layout.tsx` (root layout) with `<html lang="en">`, Montserrat + Inter + Caveat font variables, and `src/app/(app)/layout.tsx` (app shell layout) that resolves the current member server-side via Supabase and renders `AppShell` with member prop; create `src/components/shared/AppShell.tsx` with sidebar nav stubs (icons only) — Overview, Board, and placeholders for Capacity and Settings gated by `member.access === 'admin'`
  > *Ref: plan.md Project Structure, contracts/component-api.md AppShell, spec.md FR-026, FR-029, FR-038*

**Checkpoint**: `npm run dev` starts. Visiting `/` redirects to `/login`. Signing in with a non-`@forefront.consulting` account shows the domain error. Signing in with a valid account lands on `/overview` (empty page OK). Sidebar renders with nav icons.

---

## Phase 2: Schema + RLS — Security Gate

**Purpose**: Full Postgres schema with RLS policies. Every subsequent feature layer rests on this gate. Phase must be verified at the DB level before board or dashboard work begins.

**⚠️ CRITICAL**: Complete T009–T016 before any Phase 3+ work. RLS violations discovered later are expensive to fix.

- [x] T009 Apply Supabase migration `001_extensions.sql` + `002_tables.sql` from `contracts/db-schema.md`: enable `uuid-ossp`, create tables `members`, `brands`, `content_types`, `stages`, `sla_config`, `tasks`, `task_comments`, `task_attachments` with all constraints; add `prevent_nine_stage_change` trigger on `tasks`; add `update_updated_at` trigger on `tasks`; create indexes listed in db-schema.md
  > *Ref: contracts/db-schema.md 002_tables.sql, data-model.md, spec.md FR-005 (nine_stage immutability)*

- [x] T010 Apply Supabase migration `003_functions.sql` from `contracts/db-schema.md`: create `auth.user_access_level()`, `auth.user_role()`, `auth.member_id()` (all SECURITY DEFINER STABLE), and `can_advance_task(p_task_id UUID)` function; verify each function returns the expected value when called as a known user in Supabase SQL Editor
  > *Ref: contracts/db-schema.md 003_functions.sql, contracts/rls-policies.md, spec.md FR-003–FR-004, research.md Decision 8*

- [x] T011 Enable RLS and apply all policies from `contracts/rls-policies.md`: `members` (select-all / admin-write / self-status-update), `brands` (select-all / admin-write), `content_types` (select-all / admin-write), `stages` (select-only), `sla_config` (select-all / admin-write), `tasks` (select-all / admin-superuser-insert / `can_advance_task`-update / admin-delete), `task_comments` (select-all / own-insert, no update/delete), `task_attachments` (select-all / admin-superuser-insert / admin-delete)
  > *Ref: contracts/rls-policies.md, spec.md FR-003, FR-004, FR-014, SC-008*

- [x] T012 Apply Supabase migration `005_seed.sql` from `contracts/db-schema.md`: insert all 9 stage rows (with EN/AR labels, ownerRole, terminalFlag), 4 brand rows, 8 content type rows, and full 9×8 SLA config matrix; insert seed member rows matching `@forefront.consulting` emails; enable Realtime on `tasks` table
  > *Ref: contracts/db-schema.md 005_seed.sql, data-model.md Seed Data, spec.md Key Entities*

- [ ] T013 **RLS Verification — DB-Level Security Gate**: run all 5 SQL test cases from `contracts/rls-policies.md §Testing RLS` directly in Supabase SQL Editor using `SET request.jwt.claims`; confirm: (1) nobody can advance a Published task, (2) Content Creator cannot advance a review-stage task they don't own, (3) admin can advance any task, (4) `nine_stage` change throws the trigger exception, (5) User-tier INSERT on tasks is rejected; document results as comments in this task before marking complete
  > *Ref: contracts/rls-policies.md §Testing RLS, spec.md SC-008, quickstart.md Scenarios 4–5*

**Security Checkpoint ✅**: All 5 DB-level tests pass. RLS is enforced independently of any UI or Server Action code.

---

## Phase 3: Core Types + Stage Engine

**Purpose**: Foundational shared code that every subsequent component depends on. These tasks have no story label because they serve all user stories.

- [x] T014 [P] Create `src/lib/utils.ts` with `businessDaysBetween(from: Date, to: Date): number`, `calDaysBetween(from: Date, to: Date): number`, `todayISO(): string`, `initials(name: string): string`, `avatarColor(name: string): string`, `brandGradient(hex: string): string` — all pure, deterministic, no side effects
  > *Ref: research.md Decision 1, data-model.md Avatar Color Function*

- [x] T015 Create `src/lib/stage-meta.ts` — the Islam Check config-flag module: define `NINE_STAGE` and `EIGHT_STAGE` ordered arrays, `STAGE_META` record (id, labelEN, labelAR, phase, color, ownerRole, terminalFlag), `nextStageId(current: StageId, nineStage: boolean): StageId | null` function, `isWorkingStage(stageId: StageId): boolean`; verify by unit-asserting that `nextStageId('c-final', false)` returns `'r-design'` and `nextStageId('c-final', true)` returns `'c-check'` in a quick script
  > *Ref: spec.md FR-005, research.md Decision 9, data-model.md Stage Traversal, plan.md §Stage Transition Logic — this is the Islam Check config-flag implementation*

- [x] T016 [P] Create `src/lib/alert-status.ts` with `getAlertStatus(task: Task, slaConfig: SLAConfig, today: Date): AlertStatus` — implements the priority-ordered algorithm from research.md Decision 1: Overdue → Stuck → Will Miss → At Risk → Idle → On Track; create `src/store/useUIStore.ts` with Zustand store for UI ephemera only: `celebration`, `selectedTaskId`, `showTaskForm`, `profileOpen` (no persist middleware)
  > *Ref: research.md Decision 1, data-model.md UIStore, spec.md FR-023, FR-025, contracts/component-api.md §Rendering Guarantees*

---

## Phase 4: Kanban Board + Task CRUD

**Purpose**: The core daily loop. Implements the Kanban board, task cards, task modal with advance button, task creation, and comments.

**Independent Test**: A User-tier member can advance a task they own from one stage to the next. A celebration fires. They cannot advance a task owned by someone else (advance button absent). Published tasks have no advance option.

### User Story 1 — Content executor completes their stage (P1) 🎯 MVP

- [x] T017 [US1] Create `src/components/kanban/KanbanColumn.tsx` — renders stage header with EN label, AR label below, left border + gradient bg using stage color from tokens; renders a list of task cards; install `@dnd-kit/core` and `@dnd-kit/sortable`; wrap cards in `SortableContext` for within-column reorder; column header shows task count badge
  > *Ref: spec.md FR-009, plan.md §KanbanBoard, contracts/component-api.md KanbanBoard, constitution.md §II*

- [x] T018 [US1] Create `src/components/kanban/TaskCard.tsx` with props `{ task: Task & { brand: Brand; task_owner: Member }; currentStageOwner: Member | null }` — renders brand monogram badge (color dot + 2-letter initials), content type chip, platform icon (Lucide), task name, task owner avatar + stage owner avatar (using `avatarColor`/`initials`), due-date countdown (`calDaysBetween`), AlertStatus badge using `getAlertStatus`; cover image or `brandGradient` fallback; apply `ALERT_BADGE_STYLES` from tokens.ts
  > *Ref: spec.md FR-010, FR-011, FR-023, contracts/component-api.md TaskCard, plan.md §Design Token Layer*

- [x] T019 [US1] Create `src/components/kanban/StatStrip.tsx` — bar above the board showing: total task count, in-progress count (`status !== 'publish'`), tasks due today; styled with Fluxo tokens (ink text, line border, soft bg)
  > *Ref: spec.md FR-012, contracts/component-api.md §StatStrip*

- [x] T020 [US1] Create Server Action `src/actions/tasks.ts` — implement `moveTask(taskId: string): Promise<MoveTaskResult>` following `contracts/server-actions.md §moveTask`; compute `nextStageId` from stage-meta.ts; determine `shouldCelebrate` (true only when mover personally owns the stage: working stage = task owner, review stage = role match); update DB; call `revalidatePath('/board')` and `revalidatePath('/overview')`; return `{ success, shouldCelebrate, error? }`
  > *Ref: contracts/server-actions.md §moveTask, spec.md FR-003, FR-004, FR-008, FR-017, research.md Decision 11*

- [x] T021 [US1] Create `src/components/kanban/TaskModal.tsx` (Client Component) with props `{ task: Task & { brand: Brand; task_owner: Member; comments: ...; attachments: ... }; currentUser: Member; stages: Stage[]; onClose: () => void }` — renders task attributes, current stage chip (EN+AR), advance button only when `nextStageId(task.status, task.nine_stage) !== null AND user has advance permission`; lime button for own-stage advance, ink button for admin override; clicking calls `moveTask(task.id)` then sets `useUIStore.celebration` if `shouldCelebrate`; renders comment list and comment input; no advance section when Published
  > *Ref: contracts/component-api.md TaskModal, spec.md US1 Acceptance Scenarios 1–3, FR-013, FR-002*

- [x] T022 [P] [US1] Add `addComment(taskId, body)` Server Action to `src/actions/tasks.ts`; create comment input component inside TaskModal — submit on Enter or button click, calls Server Action, refreshes board path
  > *Ref: contracts/server-actions.md §addComment, spec.md Key Entities Comment*

### User Story 2 — Reviewer approves and passes the task (P1)

- [x] T023 [US2] Create `src/components/kanban/KanbanBoard.tsx` (Client Component) — wraps all 9 `KanbanColumn` components in `DndContext` from `@dnd-kit/core`; fetches tasks and members from parent via props (server-side); derives `currentStageOwner` for each task from `STAGE_META[task.status].ownerRole` → member lookup; renders `StatStrip` above columns; shows `TaskModal` when `selectedTaskId` is set in `useUIStore`; handles DnD within-column reorder (no stage change on drag — advance via TaskModal only)
  > *Ref: spec.md US2, FR-009, contracts/component-api.md KanbanBoard, research.md Decision 5*

- [x] T024 [US2] Create `src/app/(app)/board/page.tsx` — server component; fetch tasks (with brand + task_owner joins), members, stages, slaConfig from Supabase; resolve current member from session email; pass all data as props to `KanbanBoard`; admin/superuser see all tasks; user sees all tasks (all users can view the full board per spec)
  > *Ref: spec.md FR-008, FR-009, plan.md Phase 2, quickstart.md Scenario 3*

### User Story 3 — Admin creates and configures a task (P1)

- [x] T025 [US3] Add `createTask(input: CreateTaskInput)` Server Action to `src/actions/tasks.ts` following `contracts/server-actions.md §createTask` — reads creator's role from DB, sets `nine_stage = (creator.role === 'Content Creator')`, inserts task at `status: 'todo'` with today as `stage_date`; Server Action enforces admin/superuser-only via RLS (INSERT policy)
  > *Ref: spec.md FR-014, FR-015, FR-016, research.md Decision 9, spec.md US3*

- [x] T026 [US3] Create `src/components/shared/TaskForm.tsx` (Client Component) — form for new task: brand dropdown, content type dropdown, channel/platform dropdown, task owner dropdown (members list), due date picker, hours estimate, priority, cover image URL (optional); only renders when `currentUser.access` is `admin` or `superuser`; on submit calls `createTask` Server Action; close on success via `useUIStore.setShowTaskForm(false)`
  > *Ref: spec.md US3 Acceptance Scenarios, FR-015, contracts/component-api.md TaskForm*

**Checkpoint**: US1, US2, US3 acceptance scenarios pass (see quickstart.md Scenarios 3–7). Admin can create tasks. Content Creator can advance their own `c-prog` task. Cannot advance `c-final` as Content Creator. Cannot advance Published task as anyone.

---

## Phase 5: Overview Dashboard

**Purpose**: Personal dashboard — the default post-login landing page showing My Day, Up Next, and team digest.

**Independent Test**: A user opens the Overview tab, sees their assigned tasks sorted by due date with correct AlertStatus badges. Past-due tasks show Overdue badge. Capacity field is editable only for admin.

### User Story 4 — Team member monitors their workload (P2)

- [ ] T027 [US4] Create `src/components/overview/TaskPanel.tsx` — renders "My Day" or "Up Next" panel header + list of `TaskRow` components; "My Day" shows tasks where `calDaysBetween(today, due_date) ≤ 0` (due today OR overdue), sorted by due date ascending; "Up Next" shows tasks due within next 7 days (calDaysToDeadline 1–7), sorted ascending; empty-state message when no tasks
  > *Ref: spec.md FR-021, FR-022, US4 Acceptance Scenarios 1–3, quickstart.md Scenario 2*

- [ ] T028 [US4] Create `src/components/overview/TaskRow.tsx` — single task line: color dot (stage color), task name, AlertStatus badge (calls `getAlertStatus`), due date; clicking calls `useUIStore.selectTask(task.id)` to open TaskModal; badge never absent (always one of 6 values); apply `ALERT_BADGE_STYLES` from tokens.ts
  > *Ref: contracts/component-api.md PersonalBoard §TaskRow, spec.md FR-023, FR-025, data-model.md AlertStatus Badge Styles*

- [ ] T029 [P] [US4] Create `src/components/overview/BigStat.tsx` with prop `{ metric: BigStatMetric }` — gradient card using `theme` to select gradient from tokens.ts (`danger`/`accent`/`lime`/`default`); value in Montserrat 700; label in Inter; create `src/components/overview/CapacityBar.tsx` — dark card (`rail` bg) with lime→violet gradient fill bar; percentage derived from `hoursThisWeek / capacity_hrs_wk * 100`
  > *Ref: plan.md §BigStat Card Gradients, research.md Decision 2, contracts/component-api.md §PersonalBoard*

- [ ] T030 [US4] Create `src/components/overview/ProfileStrip.tsx` (current user name in Montserrat, role in Inter muted, access badge with tier color from constitution.md §III); create `src/components/overview/MemberCard.tsx` — avatar, name, role, status dot (lime=Available / coral=Busy), active task count; capacity field: `<input>` if admin, `<span>` if not; admin `onChange` calls `updateMember` Server Action
  > *Ref: contracts/component-api.md PersonalBoard §MemberCard, spec.md FR-027, constitution.md §III, quickstart.md Scenario 2 Admin gate*

- [ ] T031 [US4] Create `src/components/overview/PersonalBoard.tsx` (Client Component) — assembles ProfileStrip + 4 BigStat cards + CapacityBar + 2 TaskPanel (side-by-side on desktop, stacked on mobile) + Team Digest (MemberCard × N); all data received as props from parent server component; greeting via `getGreeting(hour)` (research.md Decision 3); layout matches `contracts/component-api.md §Layout contract`; create `src/app/(app)/overview/page.tsx` as server component fetching member, tasks, members, slaConfig and passing to PersonalBoard
  > *Ref: spec.md US4, FR-020, FR-021, FR-022, contracts/component-api.md PersonalBoard, plan.md Phase 3, quickstart.md Scenario 2*

**Checkpoint**: US4 acceptance scenarios pass (quickstart.md Scenario 2). Overdue badge shows for past-due tasks. Admin capacity field is editable. Non-admin sees read-only capacity.

---

## Phase 6: Capacity Dashboard

**Purpose**: Admin-only view of team workload vs. capacity. Non-admins cannot access the page.

**Independent Test**: Admin sees all member capacity cards with fill bars. Over-limit members show coral fill. Non-admin visiting `/capacity` is redirected.

### User Story 5 — Admin monitors team capacity (P2)

- [ ] T032 [US5] Create `src/components/capacity/MemberCapacityCard.tsx` — props: `member: Member`, `activeTasks: Task[]`; shows avatar, name, role, active task count, total hours assigned (sum of `hours_estimate`), `capacity_hrs_wk`, fill bar: ≤100% → lime (`#C8F24E`), >100% → coral (`#F5334F`); card uses `panel` bg, `line` border, 14px radius
  > *Ref: spec.md FR-027, FR-028, US5 Acceptance Scenarios 1–2, quickstart.md Scenario 8*

- [ ] T033 [US5] Create `src/components/capacity/CapacityDashboard.tsx` with props `{ members: Member[]; tasks: Task[] }` — renders `MemberCapacityCard` grid; create `src/app/(app)/capacity/page.tsx` as server component — resolve current member from session; redirect to `/overview` if `member.access !== 'admin'`; fetch all members + active tasks; render `CapacityDashboard`; Capacity nav icon in AppShell only renders when `member.access === 'admin'`
  > *Ref: spec.md FR-026, US5 Acceptance Scenario 3, contracts/component-api.md CapacityDashboard, quickstart.md Scenario 8, spec.md SC-008*

**Checkpoint**: US5 acceptance scenarios pass. Admin sees capacity cards. Content Creator visiting `/capacity` is redirected to `/overview`. Capacity nav icon absent from non-admin sidebar.

---

## Phase 7: Settings (Team + Workflow)

**Purpose**: Admin-only workspace configuration — members, brands, content types, SLA matrix.

**Independent Test**: Admin adds a new member, brand, and content type; all appear immediately in the board dropdowns. Remove-member with active tasks shows warning.

### User Story 6 — Admin configures the workspace (P3)

- [ ] T034 [US6] Create `src/actions/members.ts` with `addMember`, `updateMember`, `removeMember` Server Actions per `contracts/server-actions.md §members.ts`; `removeMember` returns `{ success: false, activeTasks: N }` when member owns active tasks; domain validation in `addMember`; all actions call `revalidatePath('/settings')` and `/board`
  > *Ref: contracts/server-actions.md §members.ts, spec.md FR-030, FR-031, US6 Acceptance Scenarios 1–2, quickstart.md Scenario 10*

- [ ] T035 [US6] Create `src/components/settings/TeamSettings.tsx` (Client Component) — member table with: avatar, editable role input, editable access dropdown, editable capacity input, remove button; stage ownership chips for 4 review stages (c-final, c-check, d-check, final-check) per member — chip active if `stage.ownerRole === member.role`; clicking chip calls stage-owner update; "Add Member" form at bottom (name, email, role, access); remove button shows warning modal when member has active tasks before calling `removeMember`
  > *Ref: spec.md FR-030, FR-031, contracts/component-api.md SettingsView §TeamSettings, quickstart.md Scenarios 9–10*

- [ ] T036 [P] [US6] Create `src/actions/settings.ts` with `updateSLA`, `createBrand`, `removeBrand`, `createContentType` Server Actions per `contracts/server-actions.md §settings.ts`; `createContentType` inserts SLA defaults for all stages simultaneously; `removeBrand` cascades to tasks (FK is ON DELETE SET NULL)
  > *Ref: contracts/server-actions.md §settings.ts, spec.md FR-032, FR-033*

- [ ] T037 [US6] Create `src/components/settings/AddBrandModal.tsx` — modal with brand name input, color picker (using `BRAND_PALETTE` from tokens), logo URL input, description textarea; submit calls `createBrand` Server Action; create `src/components/settings/WorkflowSettings.tsx` — brand list with remove buttons + AddBrandModal trigger; content type list with remove buttons + "Add Content Type" button (modal with name + per-stage SLA defaults); SLA matrix editor: rows = stages with SLA (c-prog, c-final, c-check, d-prog, d-check, final-check), columns = content types, cells = `<input type="number">` calling `updateSLA` on change
  > *Ref: spec.md FR-032, FR-033, contracts/component-api.md §WorkflowSettings, quickstart.md Scenario 11*

- [ ] T038 [US6] Create `src/components/settings/SettingsView.tsx` (Client Component) — tab switcher between Team and Workflow panels; create `src/app/(app)/settings/page.tsx` — server component; redirect to `/overview` if `member.access !== 'admin'`; Settings nav icon in AppShell only renders when admin
  > *Ref: spec.md FR-029, contracts/component-api.md SettingsView, quickstart.md Scenarios 9–11*

**Checkpoint**: US6 acceptance scenarios pass (quickstart.md Scenarios 9–11). Adding a member makes them available in board dropdowns. SLA change takes effect on next board load. Non-admin visiting `/settings` is redirected.

---

## Phase 8: Celebrations + Realtime

**Purpose**: The celebration overlay fires after a user advances their own stage. Realtime keeps the board in sync across sessions.

**Independent Test**: Advancing a task as its stage owner triggers the overlay with 4 Arabic reactions. Audio plays on click. Admin advancing someone else's stage does NOT trigger overlay. Realtime: opening the board in two tabs and advancing in one updates the other within seconds.

- [ ] T039 Create `src/lib/celebration-audio.ts` — Web Audio API synthesis for 4 reactions: `zaghrota` (rapid LFO oscillation, ~500ms), `tasqeef` (4 rhythmic gain-envelope pulses on sawtooth, ~800ms), `mabhour` (ascending arpeggio C5→E5→G5 on triangle, ~600ms), `tabla` (low-freq noise burst through bandpass filter, ~700ms); export `playCelebrationSound(reaction: 'zaghrota'|'tasqeef'|'mabhour'|'tabla'): void`; gate on `audioCtx.state === 'running'`
  > *Ref: spec.md FR-018, FR-019, research.md Decision 6, constitution.md §V*

- [ ] T040 Create `src/components/shared/CelebrationOverlay.tsx` (Client Component) — renders when `useUIStore(s => s.celebration) !== null`; full-screen overlay (z-9999), dark backdrop, centered panel; shows task name + stage label in English; Arabic subheader in Caveat font; 4 reaction buttons (زغروطة, تسقيف, انا مبهور بيا, طبلة) each with Lucide icon + reaction color (from constitution.md §V); clicking calls `playCelebrationSound(reaction)` + fires canvas confetti (canvas-based, no external lib, distinct particle shape per reaction: streamers / emoji dots / stars / drops); dismiss (×) closes overlay; overlay is RTL-aware (Arabic text renders right-to-left)
  > *Ref: spec.md FR-017, FR-018, FR-019, constitution.md §V, research.md Decisions 6–7, quickstart.md Scenario 4*

- [ ] T041 Wire Supabase Realtime in `src/components/kanban/KanbanBoard.tsx` — subscribe to `postgres_changes` on `tasks` table on mount; on any change event call `router.refresh()` to re-fetch tasks from server; unsubscribe on unmount; add celebration broadcast: after `moveTask` returns `shouldCelebrate: true`, publish to `channel('celebration-{memberId}')` with `{ taskName, stageLabel }`; subscribe to the same channel and call `useUIStore.setCelebration(payload)` on receive; channel is user-scoped so only the advancing user triggers the overlay
  > *Ref: research.md Decision 11, plan.md §Realtime Board Sync, plan.md §Celebration System, spec.md FR-017, quickstart.md Scenario 4*

**Checkpoint**: Celebration fires for own-stage advance. Audio plays on reaction click. Admin override produces no overlay. Two-tab Realtime: board syncs within ~1s of advance.

---

## Phase 9: i18n / RTL Polish

**Purpose**: Full Arabic + English bilingual interface with RTL layout switching. Applies to stage labels, navigation, and celebration copy.

**Independent Test**: Toggle to Arabic → stage column labels switch to Arabic, layout flips RTL, celebration copy is Arabic, no layout breaks.

- [ ] T042 Install `next-intl` and configure: create `messages/en.json` and `messages/ar.json` with translations for all navigation labels, panel headings, button copy, empty states, and error messages; configure `next-intl` middleware (`intl.ts`) with locale cookie (no URL segment — same URL works in both languages); update `src/app/layout.tsx` to read locale cookie and set `<html lang>` and `dir` attribute
  > *Ref: plan.md §i18n / RTL, spec.md FR-034, FR-035, FR-036, research.md Decision 10*

- [ ] T043 [P] Update all Kanban column headers to show both `stage.label_en` and `stage.label_ar` simultaneously (EN on top, AR below in smaller Caveat text); update task cards to show stage chip in current locale; update TaskModal stage chip with EN+AR; update AppShell nav items to use next-intl `t()` function; update PersonalBoard greeting and panel headings via next-intl
  > *Ref: spec.md FR-034, quickstart.md Scenario 12, constitution.md §II*

- [ ] T044 [P] Create `src/components/shared/LangToggle.tsx` — button that reads current locale from cookie and toggles between `en` and `ar`; on toggle, sets locale cookie and calls `router.refresh()`; when `ar`, updates `document.documentElement.dir = 'rtl'`; update `globals.css` to use CSS logical properties (`margin-inline-start`, `padding-inline-end`) on sidebar, panels, and task cards so they flip correctly without per-component changes; ensure `next-intl` `dir` value is applied to `<html>` element
  > *Ref: spec.md FR-036, plan.md §i18n / RTL, quickstart.md Scenario 12*

- [ ] T045 [P] Apply cover image gradient fallback everywhere: in `TaskCard.tsx` and `TaskModal.tsx`, when `task.cover_image_url` is null/empty, render `brandGradient(brand.color)` as background with brand 2-letter monogram centered; apply `brandGradient` function from `src/lib/utils.ts`
  > *Ref: spec.md FR-011, data-model.md Cover Image Fallback, quickstart.md Design Fidelity Spot-Check*

**Checkpoint**: quickstart.md Scenario 12 passes. All column headers bilingual. Toggle switches layout direction. No overflow or misalignment in RTL mode.

---

## Phase 10: Converge + Validation

**Purpose**: Verify all 38 FRs and 6 user stories against the running app. Document any deferred items.

- [ ] T046 [P] Accessibility pass: add `aria-label` to all icon-only buttons (sidebar nav, close buttons, reaction buttons); ensure all interactive elements are keyboard-reachable; task cards on Kanban board support keyboard drag via `@dnd-kit` keyboard sensor (already included in `@dnd-kit/core`); check that celebration overlay is focus-trapped while open
  > *Ref: spec.md SC-001, plan.md Phase 5*

- [ ] T047 Run all 13 quickstart.md validation scenarios against the running app and mark each ✅/❌; for any failing scenario, open a follow-up task inline with the scenario number; verify all FRs FR-001 through FR-038 against the running app; verify SC-001 through SC-008 (especially SC-008 — manipulate network to confirm DB RLS blocks unauthorized advances); commit a `VALIDATION.md` in `specs/002-fluxo-crm-core/` documenting pass/fail status for every scenario and FR
  > *Ref: quickstart.md (all scenarios), spec.md FR-001–FR-038, spec.md SC-001–SC-008, plan.md Phase 6*

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Scaffold + Auth)        → No dependencies
Phase 2 (Schema + RLS)           → Phase 1 complete (needs auth to test)
Phase 3 (Core Types + Stage Engine) → Phase 1 complete
Phase 4 (Board + Task CRUD)      → Phases 2 + 3 complete (needs DB + types)
Phase 5 (Overview Dashboard)     → Phases 3 + 4 complete
Phase 6 (Capacity Dashboard)     → Phase 2 + 3 complete (can run alongside Phase 4)
Phase 7 (Settings)               → Phase 2 + 3 complete (can run alongside Phase 4)
Phase 8 (Celebrations + Realtime)→ Phase 4 complete (needs moveTask + TaskModal)
Phase 9 (i18n / RTL Polish)     → Phase 4 complete (needs all components to i18n)
Phase 10 (Converge)              → All phases complete
```

### Phase 2 Security Gate

Phase 2 is a **hard gate**: no Phase 4+ implementation can be considered secure until T013 (DB-Level RLS verification) passes. This is what makes permissions meaningful at the network level (SC-008).

### User Story Dependencies

| Story | Phase | Depends on |
|---|---|---|
| US1 (executor advance) | Phase 4 | Phases 2 + 3 |
| US2 (reviewer approve) | Phase 4 | Phases 2 + 3, US1 board |
| US3 (admin create task) | Phase 4 | Phases 2 + 3 |
| US4 (workload monitor) | Phase 5 | Phases 3 + 4 (board for TaskModal from Overview) |
| US5 (capacity monitor) | Phase 6 | Phase 2 + 3 |
| US6 (admin configure) | Phase 7 | Phase 2 + 3 |

Phases 6 and 7 can start in parallel with Phase 4 once Phase 2 and Phase 3 are complete.

### Islam Check Config-Flag (T015)

T015 is explicitly isolated so the `nineStage` branching logic lives entirely in `src/lib/stage-meta.ts`. No pipeline code should hardcode stage ordering. T020 (`moveTask`) and T021 (`TaskModal`) import `nextStageId` from T015; they must wait for T015 but nothing else.

---

## Parallel Opportunities

### Within Phase 1

```
T001 (Next.js setup) → T004 (Supabase clients) — sequential
T002 (tokens/globals) and T003 (types) — can run in parallel with T004
T005, T006, T007, T008 — sequential (each depends on prior)
```

### Within Phase 2

T009 → T010 → T011 → T012 → T013 (all sequential — migration order)

### Within Phase 3

T014 (utils), T015 (stage-meta), T016 (alert-status + UIStore) — all parallel

### Within Phase 4

```
T017 (KanbanColumn) and T018 (TaskCard) and T019 (StatStrip) — parallel
T020 (moveTask action) — parallel with T017–T019
T021 (TaskModal) — depends on T020 (needs moveTask)
T022 (addComment) — parallel with T021
T023 (KanbanBoard) — depends on T017, T018, T019, T021
T024 (board page) — depends on T023
T025 (createTask) — parallel with T020
T026 (TaskForm) — depends on T025
```

### Phases 5, 6, 7

Can fan out in parallel once Phase 4 is complete:
- Phase 5 (Overview): T027 → T028 → T029 → T030 → T031
- Phase 6 (Capacity): T032 → T033
- Phase 7 (Settings): T034 → T035 → (T036, T037 parallel) → T038

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 only)

1. Complete Phase 1 (Scaffold + Auth)
2. Complete Phase 2 (Schema + RLS — pass T013 gate)
3. Complete Phase 3 (Types + Stage Engine — especially T015)
4. Complete Phase 4 (Board + Task CRUD)
5. **STOP and VALIDATE**: quickstart.md Scenarios 3–7
6. Deploy — team can use the board for task tracking

### Incremental Delivery

```
MVP:     Phases 1–4 → working board with auth and permissions
+US4/5:  Phase 5 + 6 → personal dashboard + capacity
+US6:    Phase 7 → full settings management
+Delight: Phases 8–9 → celebrations, Realtime, Arabic
+Done:   Phase 10 → validated against spec
```

---

## Notes

- [P] tasks touch different files — safe to run in parallel
- Each checkpoint must pass before the next phase begins
- T013 (RLS verification) is a non-negotiable security gate — DO NOT skip
- T015 (Islam Check config-flag) is deliberately isolated — no hardcoded stage sequences anywhere else
- Commit after each task or logical group; prefix commits with phase (e.g., `feat(board): TaskCard with AlertStatus badge`)
- Constitution Check comment required on all PRs introducing new components (constitution.md §Governance)
- Any divergence from design files (`design/ui/*.html`) requires explicit sign-off per constitution.md §IV
