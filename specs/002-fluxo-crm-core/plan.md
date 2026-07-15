# Implementation Plan: Fluxo CRM Core

**Branch**: `claude/build-fluxo-tool-pSio1` | **Date**: 2026-07-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-fluxo-crm-core/spec.md`

---

## Summary

Build Fluxo — a single-workspace content operations CRM for Forefront Consulting — as a full-stack Next.js 15 (App Router) + TypeScript application backed by Supabase (Postgres, Auth, Storage, Realtime) and styled with Tailwind CSS v4. The tool manages a 9-stage content pipeline for 4 client brands, with role-based permissions enforced at the database layer via Postgres RLS, live board updates via Supabase Realtime, bilingual Arabic/English with RTL layout, and an Arabic celebration overlay that fires only for the person who advanced their own stage.

The current codebase is React + Vite (SPA). This plan describes a full-stack rewrite using Next.js App Router. Existing component logic, store, and seed data are the starting reference; the React component tree and design file visuals are the UI source of truth.

---

## Technical Context

**Language/Version**: TypeScript 5.8, React 19

**Primary Dependencies**: Next.js 15, Tailwind CSS v4, @supabase/ssr v0.5+, @supabase/supabase-js v2, next-intl v3, @dnd-kit/core + @dnd-kit/sortable (Kanban drag-drop), date-fns v4, lucide-react, motion, clsx, tailwind-merge

**Storage**: Supabase Postgres (relational data), Supabase Storage (cover images)

**Auth**: Supabase Auth with Google OAuth provider; email restricted to `@forefront.consulting`

**Realtime**: Supabase Realtime (Postgres changes broadcast on `tasks` table)

**Testing**: Playwright (E2E scenarios from spec), Vitest (pure functions — alert-status, stage transitions)

**Target Platform**: Vercel (Node.js, edge middleware for auth), desktop browsers

**Performance Goals**: Board initial load < 2 s, task advance round-trip < 500 ms, celebration render < 200 ms after stage change

**Constraints**: No terminal or Node.js knowledge required for daily use; `@forefront.consulting` domain-restricted; bilingual UI with RTL without page reload

**Scale/Scope**: ~10 team members, ~200 active tasks, 4 brands, real-time multi-user board

---

## Backend Recommendation

### Supabase: Confirmed

Supabase is correct for this project. It supplies all four required services under one SDK: Postgres with RLS for the relational data model, Auth for Google Workspace OAuth, Storage for cover images, and Realtime for live board sync. No alternative is recommended.

### Next.js App Router vs. Current Vite SPA

The current codebase is a **React + Vite SPA** with Zustand for client state. The requested stack is **Next.js 15 App Router**. This is a migration, not an extension. Key tradeoffs:

| Dimension | Vite SPA (current) | Next.js App Router (this plan) |
|---|---|---|
| Data fetching | Zustand + Supabase client | Server Components + Server Actions |
| Mutation | Direct store updates | Server Actions → revalidate |
| Auth session | Client redirect flow | Server-side cookie session (middleware) |
| Hosting | Any static host | Node.js host (Vercel) |
| Realtime | Supabase Realtime in client | Same — Client Components |
| RLS | Client JWT, DB enforces | Same — cookie session carries JWT |
| Build complexity | Simple, fast cold starts | Slightly heavier — worth it for Server Actions |

**Why proceed**: Server Actions eliminate the need for custom API routes for all mutations. Middleware enforces auth before any page renders. Server Components reduce the client bundle on the read path. The Realtime board and celebration overlay are already client-side concerns and remain so.

---

## Constitution Check

*GATE: Must pass before Phase 0 research.*

| Article | Check | Status |
|---|---|---|
| I — Design System Fidelity | All stage colors, token layer, and typography extracted from design files and encoded in `lib/tokens.ts` | ✅ PASS |
| II — Workflow Pipeline Integrity | 9 stages with bilingual labels, stage ownership table enforced in DB and RLS | ✅ PASS |
| III — Role-Based Feature Access | Three tiers (admin/superuser/user) modelled as DB data; RLS `can_advance_task()` enforces at query layer | ✅ PASS |
| IV — Design-Driven Development | Four design files mapped to components; visual contracts in `contracts/component-api.md` | ✅ PASS |
| V — Cultural UX & Celebration System | Arabic celebration overlay fires via Supabase Realtime broadcast filtered to the advancing user | ✅ PASS |
| VI — State Architecture & Persistence | Client state minimal; persisted keys live in Postgres; Zustand retained only for UI ephemera (celebration, modal open state) | ✅ PASS |

---

## UI Conflicts with Spec *(flagged — do not silently resolve)*

### FLAG 1 — Stage label naming mismatch

**Spec FR-001** names the stages: `To Do → Writing → Content Review → Islam Check → Ready to Design → Designing → Design Review → Final Check → Published`

**Design files** use abbreviated IDs and different English labels:

| Stage ID | Design label (en) | Spec label (en) |
|---|---|---|
| `c-prog` | C-In Progress | Writing |
| `c-final` | C-Review | Content Review |
| `c-check` | C-Check | Islam Check |
| `r-design` | Ready For Design | Ready to Design |
| `d-prog` | D-In Progress | Designing |
| `d-check` | D-Check | Design Review |
| `final-check` | F-Check | Final Check |
| `publish` | Published | Published ✅ |

Arabic labels in the design are kept as-is (they are not in conflict with the spec). English labels should follow the spec. **Resolution required from owner before implementation** — this plan uses spec labels for English; design abbreviated labels used for internal `stage_id` keys only.

### FLAG 2 — Access tier for Islam inconsistent across design files

- **settings.html**: Islam listed with `access: 'Admin'`
- **kanban-board.html** seed data: Islam listed with `access: 'Super User'`
- **Spec + Constitution**: Admin = Raneem (Marketing Manager); Islam (Managing Director) = Super User

**Resolution**: Follow spec. Islam is Super User. `admin` access belongs to Raneem. The settings design's seed data was a prototype artefact.

### FLAG 3 — Campaign field in UI not in spec

The kanban board design includes a `campaign` field on tasks (values: Q3 Thought Leadership, Brand Launch, Always-On, Event Push). The spec FR-015 required task fields are: `brand, content type, channel, task owner, due date`. Campaign is not required.

**Resolution required from owner**: Include campaign as optional display field, or exclude. This plan includes it as a nullable optional field to match design fidelity; it does not appear in the task creation form unless the owner confirms.

### FLAG 4 — Content types differ between design files

- **settings.html**: Post, Reel, Carousel, Story, Other (uses "Carousel", omits Video / Design / Email / Deck)
- **kanban-board.html**: Post, Video, Reel, Design, Email, Story, Deck, Other (matches spec)
- **Spec Key Entities**: Post, Video, Reel, Design, Email, Story, Deck, Other

**Resolution**: Use spec list. Settings design was an earlier prototype. Seed data follows kanban-board.html which matches the spec.

### FLAG 5 — SLA matrix gaps for `todo` and `r-design`

The kanban-board.html includes SLA values for `todo` and `r-design` stages (which have no review ownership — they are waiting/transit stages). The settings.html omits them from the SLA matrix UI. The spec says "each stage + content-type combination" has a configurable SLA.

**Resolution**: Include `todo` and `r-design` in the DB schema with SLA values from the kanban seed data defaults. The Settings UI need not expose them if the owner prefers a simplified view (flag for UX decision).

---

## Design Token Layer

Extracted from all four design files. Encoded in `src/lib/tokens.ts`.

### Colors

```ts
// Base palette
ink:    '#1B1A13'   // primary text, dark backgrounds
rail:   '#17181A'   // sidebar, capacity bar background
lime:   '#C8F24E'   // primary accent (CTA, badges, fills)
coral:  '#F5334F'   // danger, overdue (also E0736A for avatar shades)
violet: '#B79CF5'   // secondary accent, capacity bar gradient end
cyan:   '#5B93F5'   // blue accent, avatars
mint:   '#3FA34D'   // success, on-track
muted:  '#8A8D91'   // placeholder text, secondary labels
soft:   '#F7F7F7'   // page background
panel:  '#FFFFFF'   // card / panel background
line:   '#E1E1E0'   // borders, dividers
```

### Stage Color Map

```ts
'todo':        '#64748B'
'c-prog':      '#3B82F6'
'c-final':     '#2E6FB0'
'c-check':     '#1F5A94'
'r-design':    '#8B5CF6'
'd-prog':      '#7C3AED'
'd-check':     '#5B3FB5'
'final-check': '#F59E0B'
'publish':     '#22C55E'
```

### Brand Seed Colors

```ts
'Forefront Consulting':   '#B4322F'
'Omnisight':              '#0E7C7B'
'The Strategy Community': '#7A5A2E'
'Islam Personal Branding':'#1E293B'
```

### Typography

| Usage | Font | Weight |
|---|---|---|
| Headings, stat values | Montserrat | 700–900 |
| Body, labels, inputs | Inter | 400–600 |
| Celebration overlay (Arabic) | Caveat | 600–700 |

### Spacing & Radii

```ts
cardRadius: 14        // task cards, panels
chipRadius: 999       // stage badges, pills
buttonRadius: 8       // primary buttons
inputRadius: 8        // form inputs
avatarRadius: '50%'   // circular avatars
```

### Alert Badge Palette

```ts
'On Track': { bg: '#EDF6C6', text: '#4B7A12' }
'At Risk':  { bg: '#F7EFD3', text: '#A9791F' }
'Will Miss':{ bg: '#F7E6D8', text: '#BF5A2A' }
'Stuck':    { bg: '#F8E7E5', text: '#C0453E' }
'Idle':     { bg: '#F1ECDD', text: '#7E6A3D' }
'Overdue':  { bg: '#F8E7E5', text: '#C0453E' }
```

### BigStat Card Gradients (Personal Board)

```ts
danger:  'linear-gradient(145deg, #FFF0F2, #FFDDE3)'   // overdue count
accent:  'linear-gradient(145deg, #EFE9FF, #DCD0FF)'   // in-progress count
lime:    'linear-gradient(145deg, #F4FFD2, #E5FF91)'   // published this week
default: 'linear-gradient(145deg, #FFF8DF, #FFEAB0)'   // capacity %
```

---

## UI-to-Component Mapping

| Design file | Route | Primary component | Notes |
|---|---|---|---|
| `personal-board.html` | `/overview` | `components/overview/PersonalBoard.tsx` | Default post-login landing |
| `kanban-board.html` | `/board` | `components/kanban/KanbanBoard.tsx` | Client component, Realtime |
| `capacity-dashboard.html` | `/capacity` | `components/capacity/CapacityDashboard.tsx` | Admin-only |
| `settings.html` | `/settings` | `components/settings/SettingsView.tsx` | Admin-only, two-tab layout |

---

## Project Structure

### Documentation (this feature)

```text
specs/002-fluxo-crm-core/
├── plan.md                    # This file
├── research.md                # Algorithm decisions, dependency choices
├── data-model.md              # TypeScript types + derived state rules
├── quickstart.md              # Validation guide
├── contracts/
│   ├── db-schema.md           # Full SQL schema + seed migrations
│   ├── rls-policies.md        # RLS policies + helper functions
│   ├── server-actions.md      # Server action signatures + return types
│   └── component-api.md       # Component prop/store contracts
└── tasks.md                   # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root) — Next.js App Router

```text
src/
├── app/
│   ├── layout.tsx                   # Root layout: Montserrat+Inter+Caveat fonts, <html lang>
│   ├── globals.css                  # CSS token variables, base reset, RTL rules
│   ├── middleware.ts                # Auth guard: redirect unauthenticated to /login
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx             # Google OAuth sign-in (server component)
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts             # Supabase OAuth callback handler
│   └── (app)/
│       ├── layout.tsx               # App shell: sidebar nav + user context (server)
│       ├── overview/
│       │   └── page.tsx             # Personal dashboard — fetches member + tasks server-side
│       ├── board/
│       │   └── page.tsx             # Kanban board — streams tasks to client, enables Realtime
│       ├── capacity/
│       │   └── page.tsx             # Capacity dashboard — admin gate in middleware/layout
│       └── settings/
│           └── page.tsx             # Settings — admin gate, two-tab layout
│
├── components/
│   ├── ui/                          # Shared primitives
│   │   ├── Badge.tsx                # AlertStatus + stage + access badges
│   │   ├── Avatar.tsx               # Initials avatar with deterministic bg color
│   │   ├── StageChip.tsx            # Colored pill for stage labels (EN+AR)
│   │   └── EmptyState.tsx           # Consistent empty panel placeholder
│   ├── overview/
│   │   ├── PersonalBoard.tsx        # Root client component; reads from Zustand
│   │   ├── BigStat.tsx              # Gradient stat card
│   │   ├── CapacityBar.tsx          # Dark card with lime→violet fill
│   │   ├── TaskPanel.tsx            # My Day / Up Next panel
│   │   ├── TaskRow.tsx              # Single task line with AlertStatus badge
│   │   ├── ProfileStrip.tsx         # User name, role, access badge
│   │   └── MemberCard.tsx           # Team digest row; editable capacity (admin)
│   ├── kanban/
│   │   ├── KanbanBoard.tsx          # Client component: DnD context, Realtime sub
│   │   ├── KanbanColumn.tsx         # Single column with header gradient + card list
│   │   ├── TaskCard.tsx             # Draggable card: brand badge, avatars, countdown
│   │   ├── TaskModal.tsx            # Detail sheet: attributes, comments, advance button
│   │   └── StatStrip.tsx            # Board-level summary bar
│   ├── capacity/
│   │   ├── CapacityDashboard.tsx    # Reads members + tasks; renders capacity cards
│   │   └── MemberCapacityCard.tsx   # Fill bar, over-limit flag
│   ├── settings/
│   │   ├── SettingsView.tsx         # Tab switcher (Team / Workflow)
│   │   ├── TeamSettings.tsx         # Member table: add/edit/remove, stage chips
│   │   ├── WorkflowSettings.tsx     # Brands, content types, SLA matrix
│   │   └── AddBrandModal.tsx        # Brand creation drawer/modal
│   └── shared/
│       ├── AppShell.tsx             # Sidebar: nav icons, brand filter, user avatar
│       ├── CelebrationOverlay.tsx   # Arabic reaction picker + confetti + audio
│       ├── TaskForm.tsx             # New task creation form (admin/superuser)
│       └── LangToggle.tsx           # AR/EN toggle, flips dir attribute
│
├── lib/
│   ├── supabase/
│   │   ├── server.ts                # createServerClient (SSR — reads cookies)
│   │   └── client.ts                # createBrowserClient (singleton)
│   ├── tokens.ts                    # All design tokens as typed constants
│   ├── stage-meta.ts                # Stage definitions: id, labelEN, labelAR, phase, ownerRole, terminal
│   ├── alert-status.ts              # getAlertStatus() — pure, deterministic
│   ├── celebration-audio.ts         # Web Audio synth for 4 Arabic reactions
│   └── utils.ts                     # businessDaysBetween, calDaysBetween, todayISO
│
├── actions/
│   ├── tasks.ts                     # moveTask, createTask, updateTask, deleteTask, addComment
│   ├── members.ts                   # addMember, updateMember, removeMember
│   └── settings.ts                  # updateSLA, createBrand, removeBrand, createContentType
│
├── types/
│   └── index.ts                     # All shared TS types (replaces current src/types.ts)
│
└── store/
    └── useUIStore.ts                # Zustand: UI-only ephemera (celebration, selectedTaskId, showTaskForm)
```

> **Note**: The Zustand store is **narrowed** to UI-only state (`celebration`, `selectedTaskId`, `showTaskForm`, `profileOpen`). Persistent data (tasks, members, slaConfig, brands) lives in Postgres and is fetched server-side. No `persist` middleware needed.

---

## Database Schema

Full schema in [`contracts/db-schema.md`](contracts/db-schema.md). Summary:

| Table | Purpose |
|---|---|
| `members` | Team members: name, email, role, access tier, capacity_hrs_wk |
| `brands` | Client brands: name, color, logo_url, description |
| `content_types` | Configurable content type labels |
| `stages` | 9 pipeline stages with EN/AR labels, owner_role, terminal_flag |
| `sla_config` | stage_id × content_type_label → max_business_days |
| `tasks` | Core task record: owner, status (stage), nine_stage flag, due date |
| `task_comments` | Append-only comments per task |
| `task_attachments` | File references per task |

### RLS Summary

Full policies in [`contracts/rls-policies.md`](contracts/rls-policies.md).

- All authenticated users can SELECT all tasks, members, brands, stages, sla_config
- INSERT tasks: admin/superuser only
- UPDATE tasks (advance stage): enforced by `can_advance_task(task_id)` — returns false if Published; true for admin/superuser; true for user if they own the current stage; always false for Published terminal stage
- Admin-only: INSERT/UPDATE/DELETE members, brands, content_types, sla_config
- Comments: any authenticated member may INSERT their own; no UPDATE/DELETE
- Attachments: admin/superuser manage; all read

---

## Auth Flow

Full flow in [`contracts/server-actions.md`](contracts/server-actions.md). Summary:

1. User visits `/login` → sees "Sign in with Google" button
2. Click → Supabase initiates Google OAuth, redirects to Google
3. Google auth → redirects to `/auth/callback?code=...`
4. `route.ts` exchanges code → Supabase session cookie (HTTP-only)
5. **Email domain check**: if `email` does not end in `@forefront.consulting` → signOut + redirect to `/login?error=domain`
6. **Member lookup**: query `members` table WHERE `email = session.user.email` → load member record
7. **Member not found**: first-time Google login creates a pending member record OR shows "Contact admin" error (policy decision — this plan defaults to error, not auto-create)
8. Middleware reads cookie on every request → if no valid session → redirect to `/login`
9. Member role + access tier resolved server-side; passed to Server Components as props

---

## AlertStatus Algorithm

Computed client-side by `getAlertStatus()`. Never stored. Full definition in [`research.md`](research.md).

```
stageDays         = businessDaysBetween(task.stage_date, today)
slaLimit          = slaConfig[task.status][task.content_type_label] ?? 1
calDaysToDeadline = calDaysBetween(today, task.due_date)

Overdue   → calDaysToDeadline < 0
Stuck     → stageDays > slaLimit + 2
Will Miss → stageDays > slaLimit
At Risk   → stageDays === slaLimit
Idle      → calDaysBetween(stage_date, today) > 2 AND stageDays === 0
On Track  → default
```

---

## Stage Transition Logic

```
Working stages (todo, c-prog, r-design, d-prog):
  next stage = STAGES[STAGES.indexOf(current) + 1]
  — exception: c-prog → c-final always
  — exception: c-final → c-check (nine_stage=true) OR r-design (nine_stage=false)

Review stages (c-final, c-check, d-check, final-check):
  next stage follows the ordered list
  — for eight-stage tasks: c-final skips c-check, goes directly to r-design

Published: terminal — no transition allowed
```

The stage ordering arrays (used in Server Action `nextStage()`):
```ts
const NINE_STAGE = ['todo','c-prog','c-final','c-check','r-design','d-prog','d-check','final-check','publish']
const EIGHT_STAGE = ['todo','c-prog','c-final','r-design','d-prog','d-check','final-check','publish']
```

---

## Celebration System

`CelebrationOverlay.tsx` fires when `useUIStore(s => s.celebration)` is non-null.

The Server Action `moveTask` returns `{ shouldCelebrate: boolean }`:
- `true` if the advancing user personally owned the stage (working stage = task owner; review stage = role match)
- `false` if the user is admin/superuser overriding someone else's stage

On `shouldCelebrate=true`, client sets `useUIStore.setState({ celebration: { taskName, stageLabel } })`.

Four reactions:
| ID | Arabic | Audio synthesis |
|---|---|---|
| zaghrota | زغروطة | Rapid high-frequency oscillation, ~500ms |
| tasqeef | تسقيف | Rhythmic low pulses, ~800ms |
| mabhour | انا مبهور بيا | Ascending chord, ~600ms |
| tabla | طبلة | Percussion pattern, ~700ms |

Confetti and audio implemented in `lib/celebration-audio.ts` via Web Audio API (no external library).

---

## Realtime Board Sync

```ts
supabase
  .channel('tasks-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
    // update local task list
  })
  .subscribe()
```

Subscribed in `KanbanBoard.tsx` on mount. Celebration broadcast via a separate Realtime channel filtered by user ID — only the sender receives the celebration trigger.

---

## i18n / RTL

- `next-intl` with `[locale]` segment in `app/` (or cookie-based switching without URL segment)
- Two message files: `messages/en.json`, `messages/ar.json`
- Stage labels shipped in both languages from `stage-meta.ts`
- `<html dir="rtl">` toggled via `LangToggle` which updates a cookie and triggers a soft nav
- All layout components use logical CSS properties (`margin-inline-start`, `padding-inline-end`) or `dir`-aware Tailwind classes

---

## Phased Build Order

### Phase 0 — Scaffold + Auth (target: working login, empty shell)

1. Init Next.js 15 project in repo root (or convert Vite → Next.js; see research.md)
2. Configure Tailwind CSS v4, install lucide-react, date-fns, motion, clsx
3. Set up `lib/supabase/server.ts` and `lib/supabase/client.ts` with `@supabase/ssr`
4. Build `/login` page with Google OAuth button
5. Build `/auth/callback/route.ts` — exchange code, domain check, member lookup
6. Build `middleware.ts` — auth guard
7. Build `(app)/layout.tsx` — AppShell with sidebar nav (placeholder links)
8. Smoke test: sign in with `raneem@forefront.consulting`, see empty shell

**Gate**: Login works end-to-end. Domain restriction fires on a non-forefront email.

---

### Phase 1 — Schema + RLS (target: DB enforces permissions)

1. Write migration: `stages` table with 9 seed rows (EN + AR labels, ownerRole, terminal_flag)
2. Write migration: `members`, `brands`, `content_types` tables with seed data
3. Write migration: `sla_config` with seed matrix (kanban-board.html defaults)
4. Write migration: `tasks`, `task_comments`, `task_attachments`
5. Write helper functions: `auth.user_access_level()`, `auth.user_role()`, `auth.member_id()`
6. Write `can_advance_task(task_id UUID)` function
7. Enable RLS on all tables; write all policies (see `contracts/rls-policies.md`)
8. Smoke test in Supabase Studio: log in as each tier, verify SELECT/INSERT/UPDATE restrictions

**Gate**: A "user" role JWT cannot advance a task owned by a different role. An "admin" JWT can advance any task. Nobody can advance a Published task.

---

### Phase 2 — Board + Tasks (target: working Kanban, task cards, advance)

1. Write `types/index.ts` — full TypeScript type surface (Task, Member, Stage, SLAConfig, AlertStatus)
2. Write `lib/stage-meta.ts`, `lib/tokens.ts`, `lib/utils.ts`, `lib/alert-status.ts`
3. Write Server Action `actions/tasks.ts`: `moveTask`, `createTask`, `updateTask`, `addComment`
4. Build `KanbanBoard.tsx` — static layout with 9 columns, column headers from STAGE_META
5. Build `TaskCard.tsx` — brand badge, content type, avatars, due-date countdown, AlertStatus badge
6. Build `StatStrip.tsx` — total / in-progress / due today counts
7. Build `TaskModal.tsx` — detail view, comment list, advance button with permission check
8. Build `TaskForm.tsx` — new task creation (admin/superuser only)
9. Wire Supabase Realtime in `KanbanBoard.tsx`
10. Build `CelebrationOverlay.tsx` + `lib/celebration-audio.ts`

**Gate**: US1 and US2 acceptance scenarios pass. Celebration fires on own-stage advance. Admin can advance any stage. Published stage is immutable.

---

### Phase 3 — Dashboards (target: Overview + Capacity pages working)

1. Build `PersonalBoard.tsx` with BigStat × 4, CapacityBar, TaskPanel × 2, Team Digest
2. Implement `getAlertStatus()` and wire to TaskRow badges
3. Build `CapacityDashboard.tsx` with MemberCapacityCard; admin gate
4. Wire `(app)/capacity/page.tsx` — redirect non-admin to `/overview`

**Gate**: US4 and US5 acceptance scenarios pass. Overdue badge shows for past-due tasks. Capacity bar is red for over-limit members. Non-admin cannot reach `/capacity`.

---

### Phase 4 — Settings (target: all admin config operations work)

1. Build `SettingsView.tsx` tab switcher (Team / Workflow)
2. Build `TeamSettings.tsx` — member table, add/edit/remove, stage owner chip assignment
3. Build `WorkflowSettings.tsx` — brand list + AddBrandModal, content type list, SLA matrix editor
4. Write `actions/members.ts` and `actions/settings.ts`
5. Implement remove-member guard: warn if member owns active tasks, require reassignment

**Gate**: US3 and US6 acceptance scenarios pass. Adding a member makes them immediately available in task assignee dropdown. Removing a member with active tasks surfaces warning.

---

### Phase 5 — Celebrations + Polish (target: complete product)

1. Verify celebration audio on Chrome, Firefox, Safari
2. Implement 4 confetti effects (canvas-based, no external library)
3. Add Arabic/English i18n with next-intl; wire `LangToggle`
4. Apply RTL layout via logical CSS and `dir` attribute
5. Add gradient fallback for tasks without cover image (derived from brand color)
6. Final accessibility pass: keyboard navigation on Kanban, ARIA labels on stage chips

**Gate**: SC-001 through SC-008 pass. Celebration fires ≥ 95% of eligible advances. Arabic RTL renders without layout breaks.

---

### Phase 6 — Converge (target: spec parity confirmed)

1. Run all acceptance scenarios from spec manually
2. Run Playwright E2E suite
3. Verify FR-001 through FR-038 against running app
4. Document any deferred items or scope changes in this file

---

## Complexity Tracking

No constitution violations. Single Next.js project, one Supabase project, standard dependency set.
