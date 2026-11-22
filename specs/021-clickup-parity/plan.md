# Implementation Plan: Momentum vs ClickUp — Brands, Team Spaces and Views

**Branch**: `claude/wonderful-dirac-k1wflu` (Spec Kit feature `021-clickup-parity`) | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Designs** (constitution §IV):

- [design/teams-brands.html](../../design/teams-brands.html): the sidebar, team Spaces, brand Folders, Calendar, Board and the hand-off box.
- [design/noran-workspace.html](../../design/noran-workspace.html): Me › My tasks (Sheet, Calendar, Board) and My sheets.
- [design/clickup-hierarchy.html](../../design/clickup-hierarchy.html): the Status words panel, the feature switches panel, simple tasks and the Sheet view look. Its Brand › Team › List tree is superseded.

## Summary

The work adds a **structure** and **views** on top of the tasks Momentum already has. Nothing about a task's pipeline changes.

- **Team Spaces** are new: a table of Spaces, a table of their members, and a table of which tasks show in which Space (**Shows in**).
- A task gains one field, **kind**: pipeline or simple. Simple tasks keep their status in a separate column, so the stage foreign key and every pipeline rule stay as they are (research R1).
- **Brands** already exist. They gain feature switches and their own Islam Check default. Their four Folders are **views**, not tables:
  - Calendar is the brand's tasks on a calendar;
  - Assets is the brand's asset links plus its open Design tasks;
  - Sheet is today's Content and Video sheets filtered to the brand, plus one blank-tab folder per brand;
  - Library is the brand's published tasks.
- **The hand-off** is a server rule inside the one move function every path already uses. A move into the design half without a production Space comes back as `needs_handoff`. One-task screens then open the box; bulk moves and pastes count the task as refused (research R4).
- **Views** are saved in a new table and drawn by a small view host. The Board reuses today's columns and cards. The Sheet reuses the existing grids. Calendar is the only view drawn from scratch.

It is built in **four stages**, each with its own PR and lab:

| Stage | What ships | Spec |
|---|---|---|
| **0** | Constitution 3.0.0; HANDOVER corrections | Clarifications |
| **A** | Spaces, members from roles, Shows in, the sidebar tree, Space pages (List and Board), the hand-off, users creating their own tasks, the renames | US1, US6, FR-012a, FR-027a |
| **B** | Calendar, Sheet and Workload views, saved views, brand Folders (Calendar, Assets, Sheet, Library), Everything, Me › My tasks and My sheets | US2 |
| **C** | Status words per Space, brand feature switches, simple tasks | US3, US4, US5 |

## Technical Context

**Language/Version**: TypeScript 5.8 (strict), React 19, Next.js 16 App Router, Prisma 5 (pinned, HANDOVER §4) and PostgreSQL.

**Primary Dependencies**: none new. Dates use the existing business-day helpers. Calendar layout is plain CSS grid.

**Storage** (details in [data-model.md](./data-model.md)):

- **New tables**: `team_spaces`, `team_space_members`, `task_spaces`, `saved_views`.
- **New columns**:
  - `tasks.kind`, `tasks.simple_status`;
  - `brands.features` (JSON), `brands.nine_stage_default`;
  - `workspace_settings.brand_feature_defaults` (JSON);
  - `sheet_folders.brand_id`.
- **Changes to existing rows** go through `once()` markers in `prisma/seed.ts`: Spaces and members from roles, and the starting Shows in lists. `prisma db push` stays the schema path.

**Testing**:

- A new lab, `lab:spaces` (`scripts/spaces-lab/`). Pure checks run in Node; UI scenarios run with Playwright against a stub host. Real-app checks live in `realapp/`.
- Every earlier lab is re-run each stage, with special attention to `lab:sheet`, `lab:spreadsheet` and `lab:inbox`, because the sheets and the Inbox move stages.
- `npm run typecheck` must pass before every commit (HANDOVER ground rule 2).

**Target Platform**: desktop and phone browsers. The sidebar becomes a drawer on phones, the hand-off box a bottom sheet, and Calendar falls back to a week list.

**Project Type**: web application (one Next.js app; server actions and server components).

**Performance Goals**:

- A Space, brand or Everything view with 5,000 tasks shows its first screen in under 2 s (SC-003). Data stays loaded the way `loadBoardData` loads it today (all tasks, filtered in the browser). Shows in and Space lists are added as two flat arrays, not per-task queries.
- The move check adds at most one indexed lookup (`task_spaces` by task).

**Constraints**:

- English and Arabic for every new string (`spaces`, `views`, `calendar`, `handoff`, `me` namespaces).
- Tokens only (constitution §I).
- One permission check per server action (ground rule 9).
- Board columns always the pipeline as built (FR-013a).
- Existing addresses unchanged (FR-012).

**Scale/Scope**: about 20 members, 4 brands, 4 to 8 team Spaces, and up to 5,000 tasks.

## Constitution Check

*Gate run against constitution 2.1.0, which is out of date (HANDOVER §14). Stage 0 rewrites it as 3.0.0, and the check is re-run against 3.0.0 after design.*

| Principle | Result | Notes |
|---|---|---|
| **I. Design System Fidelity** | Pass | New UI uses the existing tokens. The previews were built from `tokens.ts` values. Brand and stage colours are data. |
| **II. Workflow Pipeline Integrity** | **Violation, justified** | (a) The §II table lists nine stages with old names; the app has 11 (`stage-meta.ts`). (b) Simple tasks are a second workflow. Both are fixed by the 3.0.0 amendment in Stage 0. Pipeline tasks are untouched: same stages, owners, SLA, terminal Published. |
| **III. Role-Based Access** | **Changes, justified** | Users may now create tasks they own (spec clarification). Admin-only mutations (Spaces, members, brand features) are checked in their server actions. "Postgres RLS" in §III no longer exists; 3.0.0 records application-layer checks, as HANDOVER §6 describes. |
| **IV. Design-Driven Development** | Pass | The three previews are the design files. Each stage confirms its part before building. |
| **V. Celebrations** | **Addition, justified** | A simple task moved to Done celebrates for its assignee. Added to §V in 3.0.0. Pipeline celebrations are unchanged and still decided by the server. |
| **VI. State and persistence** | Pass | Saved views and Shows in are application data in Postgres. Only per-device choices use `momentum.*` localStorage: Calendar month or week, collapsed sidebar sections. The hand-off box state is UI ephemera. |
| **Tech stack** | **Out of date** | The table says Next.js 15, Supabase and Vercel. The app runs Next.js 16, Prisma and Postgres on Cranl, with a custom session. Corrected in 3.0.0; no new dependency is added. |

**Gate: passes, on condition that Stage 0 lands first.**

**Post-design re-check (against the 3.0.0 text drafted in research R9): passes.**

- No new dependency.
- Every new mutation has its own check.
- Pipeline rules are reused, not copied: the hand-off goes through the same `allowedStages` and move function.

## Project Structure

### Documentation (this feature)

```text
specs/021-clickup-parity/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0: decisions R1–R12
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1: how to check each stage
├── contracts/
│   ├── server-actions.md   # new and changed actions
│   ├── routes.md           # pages and addresses
│   └── handoff.md          # the move rule and the box, end to end
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                 # + TeamSpace, TeamSpaceMember, TaskSpace, SavedView; Task.kind/simple_status; Brand.features/nine_stage_default; SheetFolder.brand_id
└── seed.ts                       # + once('spaces-v1'), once('task-spaces-v1')

src/lib/
├── spaces.ts                     # pure: spacesForAssignee, startingSpaces, needsHandoff, isProduction
├── brand-features.ts             # pure: featureOn(brand, key, defaults)
├── simple-status.ts              # pure: SIMPLE_STATUSES, nextSimple
├── calendar.ts                   # pure: monthGrid, weekGrid, moveMonth (no React, no Prisma)
├── space-words.ts                # pure: wordsFor(space), matchWord (wraps sheet-links matchStage)
├── stage-moves.ts                # unchanged rules; + DESIGN_HALF_START = 'r-design'
├── board-data.ts                 # + spaces, taskSpaces, members; kind/simple_status mapped
└── authz.ts                      # + requireTaskCreatorFor(ownerId): users only for themselves

src/actions/
├── spaces.ts                     # NEW: Space CRUD, members, words (admin / admin+superuser)
├── task-spaces.ts                # NEW: addTaskSpace, removeTaskSpace, handOff
├── views.ts                      # NEW: saveView, deleteView
├── brands.ts                     # NEW: setBrandFeatures, setBrandNineStage, brand folder ensure
├── tasks.ts                      # CHANGED: one move core returns needs_handoff; createTask kind/space; users create own; setSimpleStatus; bulk counts handoff refusals; assignee adds Spaces
├── content.ts                    # CHANGED: addPlan skips rows that need a hand-off
└── sheet-links.ts                # CHANGED: createTasksForRows open to users for themselves

src/components/
├── shared/Sidebar.tsx            # CHANGED: nav, then Me / Teams / Brands sections
├── shared/NavTree/*              # NEW: tree sections, drawer on phones
├── views/ViewHost.tsx            # NEW: tabs, saved views, + View
├── views/ListView.tsx            # NEW
├── views/BoardView.tsx           # NEW thin wrapper over the existing KanbanColumn and TaskCard
├── views/CalendarView.tsx        # NEW
├── views/SheetView.tsx           # NEW: routes to ContentSheet / VideoSheet / TaskSheet
├── views/TaskSheet.tsx           # NEW: a task-rows grid (My tasks, Design, Planning, brand views) on GridCore + FieldCells
├── views/WorkloadView.tsx        # NEW over the capacity hours maths
├── handoff/HandoffDialog.tsx     # NEW: the box, bottom sheet on phones
├── spaces/SpaceSettings.tsx      # NEW: members, production, default kind, Status words
├── brands/BrandFolder*.tsx       # NEW: Assets (files + requests), Library (gallery)
├── brands/BrandFeatures.tsx      # NEW: switches
└── kanban/*                      # CHANGED: Shows in chips and simple status in TaskModal; drag/menu open the box on needs_handoff; toggle labels

src/app/(app)/
├── me/page.tsx                   # NEW: My tasks
├── spaces/[key]/page.tsx         # NEW
├── brands/[brandId]/[[...folder]]/page.tsx   # NEW: brand and its four Folders
├── board/page.tsx                # unchanged address; it is Everything's Board
└── team/page.tsx                 # unchanged address; nav label "Plan"

messages/en.json, ar.json         # + spaces, views, calendar, handoff, me namespaces; renamed labels
scripts/spaces-lab/               # NEW lab (pure + UI scenarios + realapp)
.specify/memory/constitution.md   # 3.0.0 (Stage 0)
HANDOVER.md                       # Board drag is cross-column; new sections for this spec
```

**Structure Decision**: one Next.js app, as today. All the arithmetic is pure and lives in `src/lib`, so the lab can test it without React or Prisma (ground rule 12). New screens sit beside the old ones; old screens are only changed where the spec says so (labels, the box on `needs_handoff`, Shows in on the task panel).

## Stage details

### Stage 0: Constitution 3.0.0

- Rewrite `.specify/memory/constitution.md` from research R9.
- Correct HANDOVER §7: Board drag moves across columns through `allowedStages`.
- No code changes.

### Stage A: Spaces, Shows in, the hand-off (US1, US6)

1. **Schema**: the four tables and `tasks.kind`. `once('spaces-v1')` creates Content, Design, Video and Planning with members from roles. `once('task-spaces-v1')` applies FR-008.
2. **Server**: the move core returns `needs_handoff` (contracts/handoff.md). Add `handOff`, `addTaskSpace` and `removeTaskSpace`. Assigning someone adds their Spaces. Users may create tasks they own.
3. **Bulk and paste**: `bulkUpdateTasks` and `addPlan` count hand-off refusals and say so (FR-030a).
4. **UI**:
   - the sidebar tree;
   - `/spaces/[key]` with List and Board;
   - Shows in chips in TaskModal;
   - `HandoffDialog`, wired to Advance, the stage menu, Board drag, Inbox and the sheets' status cells;
   - "+ Task" in a Space;
   - the renames.
5. **Lab**:
   - pure checks for `startingSpaces`, `spacesForAssignee` and `needsHandoff`;
   - UI scenarios for the box, opened from each one-task path;
   - a real-app scenario that a bulk move refuses and names the count.

### Stage B: Views, brands, Me (US2)

1. **Schema**: `saved_views` and `sheet_folders.brand_id`.
2. **Views**:
   - `ViewHost` with saved views;
   - `CalendarView` (month, week, Today, drag to set the due date);
   - `SheetView`: Content and Video Spaces get today's sheets; everything else gets `TaskSheet`;
   - `WorkloadView`.
3. **Brands**:
   - `/brands/[id]` and its Folders;
   - Calendar with a campaign filter (projects);
   - Assets: `BrandAsset` links plus open Design tasks;
   - Sheet: the Content and Video sheets filtered by brand, plus the brand folder's blank tabs;
   - Library: published tasks.
4. **Me**:
   - `/me` with Sheet, Calendar and Board, and the All mine, Assigned to me and Handed off filter;
   - a private "My notes" column (research R7);
   - pinned folders under Me.
5. **Lab**:
   - calendar grid maths;
   - brand filter on the linked sheets;
   - My tasks membership;
   - saved-view round trip;
   - every earlier sheet lab re-run.

### Stage C: Words, features, simple tasks (US3, US4, US5)

1. **Status words**:
   - Content and Video Spaces read and write their sheets' existing `view.words` (research R5);
   - other Spaces use `team_spaces.words`;
   - one matcher for both.
2. **Brand features**: switches in brand settings. `featureOn()` gates TaskModal, TaskForm, cards, filters and sheet columns per task's brand.
3. **Simple tasks**:
   - `kind` and `simple_status`;
   - their own three Board columns;
   - left out of SLA, review queues, Inbox and Library;
   - Done celebration;
   - a default kind per Space.
4. **Lab**:
   - word matching, including clashes;
   - `featureOn` with brand overrides;
   - simple tasks never reaching the pipeline paths.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A second workflow (simple tasks) beside the pipeline (§II) | Planning and admin work has no design or approval stages; forcing it through the pipeline pollutes SLA and review queues (spec US5). | Putting simple statuses into the `stages` table would make every Board, SLA and `STAGE_META` consumer treat them as pipeline stages (research R1). |
| Users creating tasks (§III) | Clarified by the user: content creators, designers and editors create their own work. | Keeping creation for admins and superusers blocks the Space "+ Task" and "Create task from a row" flows the spec is built on. |
| Two places for status words (`sheet.view.words` and `team_spaces.words`) | The Content and Video Spaces' Sheet tabs are today's sheets, which already store words. | Moving the sheets' words into Spaces would change spec 019 storage and every linked-sheet screen for no visible gain (research R5). |
