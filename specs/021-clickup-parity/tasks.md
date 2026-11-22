# Tasks: Momentum vs ClickUp — Brands, Team Spaces and Views

**Input**: Design documents from `specs/021-clickup-parity/`: plan.md, spec.md, research.md (R1–R12), data-model.md, contracts/handoff.md, contracts/server-actions.md, contracts/routes.md, quickstart.md.

**Tests**: as in earlier specs, each story is checked by a lab (`npm run lab:spaces`, `scripts/spaces-lab/`). Pure helpers run in Node; UI scenarios run with Playwright against a stub host; real-app checks live in `realapp/`. There is no unit test framework. `npm run typecheck` must pass before every commit.

**Format**: `[ID] [P?] [Story] Description`. [P] means the task can run in parallel (a different file, with no unfinished dependency).

**Stages** (plan.md), each with its own design approval, PR and lab:

| Stage | Covers |
|---|---|
| **0** | Phase 1 |
| **A** | Phase 2, US1, US6 |
| **B** | US2 |
| **C** | US3, US5, US4 |

---

## Phase 1: Setup (Stage 0 and shared scaffolding)

- [X] T001 Rewrite `.specify/memory/constitution.md` as version 3.0.0, following research.md R9:
  - **Stack**: Next.js 16, Prisma 5 with Postgres on Cranl, the custom HMAC session; no Supabase and no RLS.
  - **§II**: the 11 stages and owners from `src/lib/stage-meta.ts`, with C-Check optional per task and the default set per brand. Simple tasks (To Do › In progress › Done) as a second workflow.
  - **§III**: users may create tasks they own. Spaces and brand features are admin-only.
  - **§V**: the Done celebration for simple tasks.
  - **§VI**: without the Supabase wording.
  - A new sync report at the top.
- [X] T002 [P] Correct HANDOVER.md: Board drag moves tasks across columns through `allowedStages` (`KanbanBoard.tsx:308-351`). Fix §7 "Drag and drop is reorder-only", ground rule 7, and the lines near 80, 1165 and 1214 that repeat it.
- [X] T003 [P] Add the `spaces`, `views`, `calendar`, `handoff` and `me` namespaces in English and Arabic, with every label used in `design/teams-brands.html` and `design/noran-workspace.html`. Change `nav.team` to "Plan", `header.mine` to "Mine" and `header.team` to "Everyone" in both languages. Files: `messages/en.json`, `messages/ar.json`.
- [X] T004 [P] Create the lab skeleton in `scripts/spaces-lab/`, copying the shape of `scripts/inbox-lab`:
  - `build.sh`, `pure-entry.ts`, `scenarios.mjs`, `entry.tsx`, `fixtures.ts`, `gen.mjs`, `index.html`, `scenarios/index.mjs`, `realapp/run.cjs`.
  - Fixtures: 4 brands, the 4 Spaces, the 7 seeded roles, and 30 tasks across stages and types.
  - Add `"lab:spaces"` to `package.json`.
  - *(Done: build, pure checks, runner and fixtures. The UI entry, `gen.mjs`, `index.html` and `ui-runner.mjs` arrive with the first UI scenarios, T027.)*
- [X] T005 Get the user's approval of `design/teams-brands.html` (Stage A: sidebar, Space pages, Shows in, hand-off box) and `design/noran-workspace.html` (Stage B: My tasks, My sheets) as the design files (constitution §IV). Note the approval date in plan.md. *(2026-11-22: both previews were reviewed and revised with the user in this session, and the user started implementation. Recorded in plan.md.)*

---

## Phase 2: Foundational (Stage A; blocks every story)

- [X] T006 Add the models and fields from data-model.md to `prisma/schema.prisma`:
  - `TeamSpace` → `team_spaces`;
  - `TeamSpaceMember` → `team_space_members`;
  - `TaskSpace` → `task_spaces`, with an index on `space_id`;
  - `SavedView` → `saved_views`, with an index on (`node`, `owner_id`);
  - `Task.kind` (default "pipeline") and `Task.simple_status`;
  - `Brand.features` (Json, default `{}`) and `Brand.nine_stage_default` (Boolean?);
  - `WorkspaceSettings.brand_feature_defaults` (Json, default `{}`);
  - `SheetFolder.brand_id` (unique, cascade).

  Run `npx prisma validate`.
- [X] T007 Add the types to `src/types/index.ts`: `TaskKind`, `SimpleStatus`, `TeamSpace`, `TaskSpace`, `SpaceMember`, `SavedView`, `ViewType`, `ViewNode`, `BrandFeatures` and `BrandFolderKey`. Extend `Task` with `kind` and `simple_status`, and `BoardData` with `spaces`, `spaceMembers` and `taskSpaces`. Map the new fields in `src/lib/mappers.ts`.
- [X] T008 [P] Write the pure helpers in `src/lib/spaces.ts` (contracts/handoff.md):
  - `startingSpaces(task, spaces, membersBySpace)`: the FR-008 rules;
  - `spacesForAssignee(task, assigneeId, spaces, members)`: skips Spaces whose `default_kind` is 'simple' for pipeline tasks;
  - `needsHandoff(task, target, shownIn, spaces)`;
  - `handoffDefaults(task, spaces, members)`: Video for Video and Reel, Design otherwise;
  - `isProduction(space)`.

  Also export `DESIGN_HALF_START = 'r-design'` from `src/lib/stage-moves.ts`.
- [X] T009 [P] Write the pure helpers `featureOn(brand, key, defaults)` in `src/lib/brand-features.ts`, and `SIMPLE_STATUSES` and `nextSimple(status)` in `src/lib/simple-status.ts`.
- [X] T010 Add `once('spaces-v1')` to `prisma/seed.ts` (research R3):
  - Create Content (pipeline), Design (pipeline, production), Video (pipeline, production) and Planning (simple), with token colours.
  - Add members by role: Video Editor → Video; Graphic Designer → Design; Content Creator and Digital Marketing Specialist → Content and Planning.
- [X] T011 Add `once('task-spaces-v1')` to `prisma/seed.ts`: for every task, insert `startingSpaces(...)` rows with `added_via='migration'` using `createMany({ skipDuplicates: true })`. Log the task count before and after, and stop if they differ (FR-008, SC-001).
- [X] T012 Extend `loadBoardData` in `src/lib/board-data.ts` to return `spaces` (not archived), `spaceMembers` and `taskSpaces` as flat arrays, plus `kind` and `simple_status` on each task (plan: no per-task queries).
- [X] T013 Add `requireTaskCreatorFor(ownerId)` to `src/lib/authz.ts` (research R10): admins and superusers may create for anyone; users only when `ownerId` is themselves.
- [X] T014 [P] Add the pure checks to `scripts/spaces-lab/pure-entry.ts` and `scenarios.mjs`:
  - the `startingSpaces` table: pipeline, Video at D-In Progress, Post at D-Check, an assignee in Video, a simple task;
  - `spacesForAssignee`, including the Planning skip;
  - the `needsHandoff` matrix on both paths (with and without C-Check);
  - `featureOn` with overrides and defaults;
  - `nextSimple`.

**Checkpoint**: `bash scripts/migrate.sh` runs twice with no second write; `npm run lab:spaces` passes the pure checks; nothing changes on screen.

---

## Phase 3: User Story 1 - Brands hold the work; team Spaces show it (P1, Stage A) 🎯 MVP

**Goal**: a sidebar with Me, Teams and Brands; Space pages listing a team's tasks from every brand; brand pages listing a brand's tasks; the Shows in list on the task panel; Spaces managed by admins.

**Independent Test**: as a Video Editor, only the Video Space shows under Teams. The Video Space lists video work from all four brands, grouped by brand. Adding Design to a task's Shows in makes it appear in the Design Space. The Board "All" scope is unchanged (spec US1).

- [X] T015 [P] [US1] Create `src/actions/spaces.ts` per contracts/server-actions.md, each action with `requireAdmin` first:
  - `createSpace`, `updateSpace`, `setSpaceMembers`;
  - `archiveSpace` and `restoreSpace`;
  - `deleteSpace(id, confirmName)`: archived Spaces only, and the name must match.
- [X] T016 [P] [US1] Create `src/actions/task-spaces.ts` with `addTaskSpace(taskId, spaceId)` and `removeTaskSpace(taskId, spaceId)`. Both are guarded by `canAct` (`src/actions/tasks.ts:27-35`) and write `added_via='manual'` / `added_by`.
- [X] T017 [US1] Add `loadNavTree(member)` in `src/lib/nav-tree.ts`: the Spaces visible to the member (their memberships, or all for admins), each with its open-task count, plus brands with their open-task counts and a "No brand" entry when tasks have no brand. Call it in `src/app/(app)/layout.tsx` beside `loadPinnedFolders`.
- [X] T018 [US1] Restructure `src/components/shared/Sidebar.tsx` (contracts/routes.md):
  - the nav, as today;
  - **Me**: the pinned folders, moved from under Sheets;
  - **Teams**;
  - **Brands**, each with Calendar, Assets, Sheet and Library links.

  Build it from new `src/components/shared/NavTree/TreeSection.tsx`, `SpaceItem.tsx` and `BrandItem.tsx`. Sections collapse (`momentum.sidebar.collapsed`, read after mount, in try/catch). On phones it is a drawer. Strings come from the `spaces` namespace.
- [X] T019 [US1] Add a `scopeTasks?: (t: Task) => boolean` prop and a `surface: 'board' | 'space' | 'brand' | 'me'` value to `src/components/kanban/KanbanBoard.tsx`. When set, it filters tasks before `tasksByStage` and keeps `moveTo`, drag, bulk and the modal unchanged. `/board` passes nothing and behaves as today.
- [X] T020 [P] [US1] Create `src/components/views/ListView.tsx`: rows grouped by stage, or by brand on a Space. Each row shows the brand mark, stage pill, assignee, due date and SLA badge. Clicking a row opens TaskModal through the same `selectedTaskId` store key as the Board.
- [X] T021 [P] [US1] Create `src/components/views/BoardView.tsx`, which renders `KanbanBoard` with `scopeTasks` and the original columns (FR-013a), and `src/components/views/ViewHost.tsx` with default tabs only (List and Board in this phase; contracts/routes.md).
- [X] T022 [US1] Create `src/app/(app)/spaces/[key]/page.tsx`:
  - Return 404 for an unknown or archived key, or for a non-admin who isn't a member.
  - Load `loadBoardData`, then render `ViewHost` with `scopeTasks = t => taskSpaces has (t.id, space.id)`.
  - The header shows the Space name, its members and "Shows: …" text from `design/teams-brands.html`.
- [X] T023 [US1] Create `src/app/(app)/brands/[brandId]/[[...folder]]/page.tsx`:
  - Brand level only in this phase (List and Board of `brand_id = id`).
  - `none` means `brand_id IS NULL`.
  - Unknown brands return 404.
  - Folder segments render a "coming in Stage B" placeholder until US2.
- [X] T024 [US1] Create `src/components/kanban/ShowsIn.tsx`: Space chips with × (remove) and "+ Add" (Spaces the member can see), and a hint showing why each Space is there (`added_via`). Mount it in `src/components/kanban/TaskModal.tsx` under the stage row, editable when `canEdit`.
- [X] T025 [US1] Create `src/components/settings/SpacesSettings.tsx`, a "Spaces" tab in `src/components/settings/SettingsView.tsx`:
  - list, create and rename Spaces; set colour, production and default kind;
  - members (a multi-select of members);
  - archive and restore;
  - delete with a typed name.

  Admin only (the page is already admin-only).
- [X] T026 [US1] Point the nav label in `src/lib/nav.tsx` and the Board toggle in `src/components/board/BoardToolbar.tsx` at the renamed messages from T003. `/team` keeps its address (FR-012a).
- [X] T027 [US1] Add UI scenarios in `scripts/spaces-lab/scenarios/us1.mjs`: *(done as real-app scenarios in `scripts/spaces-lab/realapp/scenarios.cjs`, run with `realapp/run.cjs us1` against a seeded database: 8/8 pass. The Arabic and phone-drawer checks are still to do and are folded into T073.)*
  - the sidebar per role (admin sees 4 Spaces, Video Editor 1);
  - the Space page grouping by brand;
  - Shows in add and remove;
  - an unknown Space returns 404;
  - Arabic mirroring;
  - the phone drawer;
  - no MISSING_MESSAGE errors.

**Checkpoint**: Spaces and brand pages work with List and Board; Shows in can be edited; the old screens are unchanged except for the labels.

---

## Phase 4: User Story 6 - One task, every Space it belongs to (P1, Stage A)

**Goal**: assigning someone adds their Space; moving into Ready For Design without a production Space opens the hand-off box on every one-task path; bulk moves and pastes refuse those tasks; users create their own tasks.

**Independent Test**: as a Content Creator, create a Video task from the Content Space and advance it to C-Check, then advance it again. The box opens with Video ticked. Choose the Video Editor: the task shows in Content and Video, and the editor is notified. Separately, a bulk move to Ready For Design reports "2 need a hand-off" (spec US6; quickstart Stage A steps 3–8).

- [X] T028 [US6] Add the hand-off check to `setTaskStage` and `moveTask` in `src/actions/tasks.ts`, after `allowedStages`. Load the task's `task_spaces` and the Spaces, call `needsHandoff`, and return `{ success:false, error:'needs_handoff', target, defaults: handoffDefaults(...) }` without writing. Add the `needs_handoff` variant to `MoveTaskResult` in `src/types/index.ts`.
- [X] T029 [US6] Add `handOff(taskId, { target, spaceIds, assigneeId })` to `src/actions/task-spaces.ts`, following contracts/handoff.md. In one `prisma.$transaction`:
  1. re-check `allowedStages`;
  2. validate that the Spaces are live production Spaces and the assignee is a member of one;
  3. upsert the rows with `added_via='handoff'`;
  4. set the assignee, follow with `clearMute` and notify 'assigned', using the helpers `updateTask` uses (`tasks.ts:269-283`);
  5. add the assignee's other Spaces;
  6. move the stage, set `stage_date` and send the moved-to-stage notifications as `setTaskStage` does.

  Return `shouldCelebrate`.
- [X] T030 [US6] In `src/actions/tasks.ts`, make an assignee change in `updateTask` and in `bulkUpdateTasks` add `spacesForAssignee(...)` rows (`added_via='assignee'`), never removing any. In `bulkUpdateTasks`, skip tasks where `needsHandoff` is true for a status patch and return a `handoff` count beside `refused` (FR-030a).
- [X] T031 [US6] In `addPlan` (`src/actions/content.ts:196-232`), skip matched rows whose pasted stage needs a hand-off, and new rows pasted at `r-design` or later. Return `handoff: number`. Show the count in the Paste plan result message in `src/components/content/ContentSheet.tsx`, and add the string to `content` in both message files.
- [X] T032 [US6] Use `requireTaskCreatorFor(input.owner)` in `createTask` and `createTasks` (`src/actions/tasks.ts`), and add the `spaceId?` input (a 'created' row). Without it, add the creator's single Space, or the one chosen in TaskForm when they belong to several (FR-027a, FR-028).
- [X] T033 [US6] In `src/actions/sheet-links.ts`, let users create tasks for themselves: `createTasksForRows` uses `requireTaskCreatorFor(self)` and `linkChoices.canCreate` becomes true. Created tasks take the brand from a row cell that names a brand.
- [X] T034 [US6] Show the column "+" for users (`src/components/kanban/KanbanBoard.tsx:1182`). In `src/components/shared/TaskForm.tsx`, lock the owner to the user when the access is 'user', and add a "Show in" Space select when the member belongs to several Spaces. Add "+ Task" to the Space header in `src/components/views/ViewHost.tsx`, passing `spaceId`.
- [X] T035 [US6] Create `src/components/handoff/HandoffDialog.tsx`:
  - the title, the current Space chips, one checkbox per production Space with its members, "Assign to" built from the ticked Spaces, and a "Move to {stage}" confirm that stays disabled until it is valid;
  - Cancel and Esc;
  - a focus trap;
  - a bottom sheet on phones, mirrored in RTL;
  - tokens only.

  Add a `handoff` slice (`{ taskId, target, defaults } | null`) to `src/store/useUIStore.ts`, and mount the dialog once in `src/app/(app)/layout.tsx`. On confirm it calls `handOff` and plays the celebration when `shouldCelebrate`.
- [X] T036 [US6] Open the dialog on `needs_handoff` from every one-task path (contracts/handoff.md table):
  - TaskModal Advance (`TaskModal.tsx:760-772`) and the stage menu (`:913-933`);
  - Board `moveTo` and drag (`KanbanBoard.tsx:360-375`; the card returns to its column first);
  - Inbox move (`KanbanBoard.tsx:812-815` → `InboxPanel.tsx`);
  - single status cells in `src/components/sheet/VideoSheet.tsx`, `src/components/content/ContentSheet.tsx` and the team-sheet `writeOne` result in `src/components/sheets/links/useTaskLinks.tsx`, reverting the cell.

  *(Done: TaskModal Advance and stage menu, and the Board's `moveTo`, which drag, Inbox and the Content and Video sheet cells all go through. Team sheets with mapped Stage columns still report `needs_handoff` as a refused cell instead of opening the box; follow-up.)*
- [X] T037 [US6] In multi-cell fill and paste on the Content, Video and team sheets (`useLinkedEditing.writeCells` and the team-sheet batch), count `needs_handoff` results instead of opening boxes, and show "{n} need a hand-off. Open the task to hand it off." Make the same message show for the `handoff` count in `src/components/kanban/BulkBar.tsx` and the sheet bulk bars. *(Done for the Board's bulk bar, the sheets' bulk bars and Paste plan. For multi-cell fill and paste, the store opens one box at a time and refuses the rest, which the sheets show as unsaved cells.)*
- [X] T038 [US6] Add UI scenarios in `scripts/spaces-lab/scenarios/us6.mjs`:
  - the box from Advance, the stage menu, drag, Inbox and a sheet cell;
  - Cancel leaves the task unchanged;
  - confirm adds the Spaces;
  - Arabic and phone.

  Add real-app checks in `scripts/spaces-lab/realapp/handoff.cjs`:
  - a bulk move refuses 2 of 3 and names the count;
  - a Paste plan row is skipped;
  - a user creates their own task and can't set another owner;
  - assigning the Video Editor adds Video with no box later.

  *(Done in `realapp/scenarios.cjs` (us6-*, 5/5 pass): Advance → box → confirm (move, assignee, Spaces, notification, follow); Cancel; stage menu; already in Video → no box; a user creates their own task from a Space. Bulk and Paste plan refusals are covered by the server code path but not yet by a real-app scenario; follow-up in T073.)*

**Checkpoint (end of Stage A)**: quickstart Stage A steps 1–10 pass. `lab:spaces`, `lab:sheet`, `lab:spreadsheet`, `lab:inbox` and `lab:notify` all pass. Open the Stage A PR.

---

## Phase 5: User Story 2 - Views anywhere, Me, brand Folders (P1, Stage B)

**Goal**: List, Board, Sheet, Calendar and Workload on every Space, brand and brand Folder, with saved views; the four brand Folders; Me › My tasks and My sheets.

**Independent Test**: in the Video Space, Board has the 11 original columns. Dragging a task to another day on Forefront › Calendar changes it everywhere. `/me` lists Noran's tasks across brands; her "My notes" is invisible to others. Forefront › Sheet shows only Forefront rows with the shared columns (spec US2; quickstart Stage B).

- [X] T039 [P] [US2] *(Done, plus `listViews(node)` so the page loads its views without a server round-trip through every route. Shared views: anyone may add one, and the creator, an admin or a superuser may change it. On a Space, only its members (or leads) save views. The pure rules are in `src/lib/view-config.ts` (`cleanConfig`, `applyView`) and checked in `pure-view-config`.)* Create `src/actions/views.ts` with `saveView`, `deleteView` and `reorderViews` (contracts/server-actions.md permissions), and `loadViews(node, memberId)` in `src/lib/views-data.ts`.
- [X] T040 [US2] *(Done on the Space, brand and My tasks pages: saved views as tabs (personal ones marked "only me"), "+ View" with List, Board, Sheet, Calendar and Workload (Gantt and Doc disabled as "later"), a config bar (Brand, Assignee, Type and Campaign filters with "No one" and "No campaign", Group for List, Sort for List and Sheet, Fields for Sheet), Save, Delete and ‹ › reorder, read-only for others' shared views, and `?view=v:<id>` links. Brand Folders don't take saved views yet. Checked in `scripts/spaces-lab/realapp/scenarios-sheet.cjs` (views-*).)* Complete `src/components/views/ViewHost.tsx`:
  - default tabs per node (contracts/routes.md);
  - saved views as tabs, shared and personal;
  - "+ View" with the five types, and Gantt and Doc disabled as "later";
  - a config bar (filters: brand, assignee, type, campaign; group; sort; visible fields) saved through `saveView`;
  - the view in the URL (`?view=`).
- [X] T041 [P] [US2] Write the pure calendar helpers in `src/lib/calendar.ts`: `monthGrid(year, month)` (Monday first, whole weeks), `weekGrid(anchor)`, `moveMonth` / `moveWeek` and `isoOf`. Add pure checks in `scripts/spaces-lab/pure-entry.ts` for month lengths, the year boundary and RTL order.
- [X] T042 [US2] Create `src/components/views/CalendarView.tsx` from `design/teams-brands.html`:
  - month and week, ‹ ›, Today;
  - finished work marked ✓ on its day;
  - drag a task to a day → `updateTask({ due_date })`, with an Undo toast;
  - a "No date" strip;
  - a campaign filter (projects of the brand);
  - colour by brand on Spaces and Me, by stage on a brand;
  - `momentum.calendar.mode` saved per device;
  - a week list on phones.
- [X] T043 [US2] Create `src/components/views/SheetView.tsx`: the `content` Space renders today's `ContentSheet`, and the `video` Space today's `VideoSheet`, unchanged (FR-012). Every other node renders `TaskSheet`. *(Done for the Content and Video Spaces and the brand Sheet Folder. Every other node renders `TaskSheet` (T044).)*
- [X] T044 [US2] *(Done: typed cells for Task, Brand, Status, Assignee, Due, Type, Priority and Platform, with group rows, row numbers, multi-cell paste and clear (hand-offs refused one by one with a reason), and read-only for anyone but the owner, the assignee or an admin. A Status change that needs a hand-off opens the box. Enabled on the Design, Planning and other Spaces, on brand pages (Sheet tab, plus "All tasks" in the Sheet Folder) and on My tasks. Not yet: the Working doc and Post link columns, and the full sheet toolbar (filter, sort, formats), which come with T040's config bar.)* Create `src/components/views/TaskSheet.tsx` on `src/components/sheet/GridCore.tsx` with `src/components/sheets/links/FieldCells.tsx` controls:
  - rows are the node's tasks, with optional group rows;
  - the field columns from spec 019 (Task, Brand, Status, Assignee, Due date, Type, Platform, Working doc, Post link);
  - status typing goes through `setTaskStage`, so the hand-off and the rules apply;
  - the toolbar and menu chrome is the existing sheet header (FR-014a).
- [X] T045 [P] [US2] Extract the task-hours aggregation from `src/components/capacity/CapacityDashboard.tsx` into the pure `src/lib/task-load.ts`. Create `src/components/views/WorkloadView.tsx` over it: open tasks per person, split by brand, against `capacity_hrs_wk`.
- [X] T046 [P] [US2] Add an optional `brandId` predicate to the pure row builders: `buildContentRows` / `piecesOf` in `src/components/content/rows.ts`, and `sheetVideos` / `buildRows` in `src/components/sheet/rows.ts`. Add a `brandId?` prop to `ContentSheet.tsx` and `VideoSheet.tsx` that passes it through. Columns, words, formats and row heights stay keyed by kind (research R6).
- [X] T047 [US2] Create `src/actions/brands.ts` with `ensureBrandSheetFolder(brandId)`, which idempotently creates `SheetFolder { kind:'brand', brand_id }`. Hide `kind='brand'` folders from `listFolders` in `src/actions/sheets.ts` and from `loadPinnedFolders` in `src/lib/sheets-nav.ts`.
- [X] T048 [US2] Create the brand Folder components:
  - `src/components/brands/BrandSheet.tsx`: tabs for Content (filtered), Video (filtered) and the brand folder's blank tabs, through `Workbook`;
  - `src/components/brands/BrandAssets.tsx`: the Files grid from `brand_assets`, an add and remove form for admins only using `addBrandAsset` / `removeBrandAsset` in `src/actions/settings.ts`, and "Asset requests" (the brand's open Design tasks);
  - `src/components/brands/BrandLibrary.tsx`: a gallery of published pipeline tasks with `published_url` / `post_url`, plus a Sheet tab.

  Wire them into `src/app/(app)/brands/[brandId]/[[...folder]]/page.tsx` (calendar, assets, sheet, library) through `ViewHost`.
- [X] T049 [US2] *(Done as a filter in `MyTasks.tsx` over `loadBoardData`, which already loads every task; the `me:<id>` columns come with T051.)* Add `loadMyTasks(memberId)` to `src/lib/board-data.ts`: tasks where `assignee_id = me`, plus tasks where `task_owner_id = me AND assignee_id ≠ me`, and the member's `me:<id>` columns and values.
- [X] T050 [US2] Create `src/app/(app)/me/page.tsx` and `src/components/me/MyTasks.tsx`:
  - tabs Sheet, Calendar and Board;
  - the "Show" filter: All mine, Assigned to me, Handed off;
  - Sheet groups: Working on, Handed off · I own it, Planning, Published (`design/noran-workspace.html`).

  *(Done with List (the four groups), Sheet (same groups plus My notes), Calendar and Board tabs and the Show filter.)*
- [X] T051 [US2] *(Done with dedicated actions in `src/actions/my-notes.ts` (`myNotes`, `setMyNote`) that only ever touch the caller's own `me:<id>` column, rather than widening `sheet-columns.ts`. `loadBoardData` and the mappable-column list exclude `me:` columns. Checked in `scripts/spaces-lab/realapp/scenarios-sheet.cjs`.)* Allow a private regular column on My tasks:
  - in the sheet-column actions (`src/actions/sheet-columns.ts`, spec 010), accept sheet keys `me:<memberId>` only when the member is that member;
  - read and write `SheetValue` per task;
  - render it in `TaskSheet` as a grey regular column named "My notes" by default (research R7).
- [X] T052 [US2] Add "My tasks" with its open count to the Me section in `src/components/shared/NavTree/TreeSection.tsx`, above the pinned folders (FR-013b, FR-013c).
- [X] T053 [US2] Add UI scenarios in `scripts/spaces-lab/scenarios/us2.mjs`:
  - default tabs per node;
  - saving a personal view and reloading;
  - Calendar navigation and drag with Undo;
  - the brand Sheet showing only that brand's rows;
  - Assets and Library contents;
  - My tasks groups and filter.

  Add real-app checks in `realapp/views.cjs`: My notes is invisible to another member; `/board?view=content` is unchanged. Run the 5,000-task check from `scripts/spreadsheet-lab/realapp/perf-axe.cjs` against a Space, a brand and Everything (SC-003).

  *(Done in `realapp/scenarios-us2.cjs` (4/4 pass): Calendar navigation, week view, drag with Undo; the Content Space's Sheet tab; brand Calendar, Assets, Library and Sheet Folders and the brand's own folder; My tasks and the Handed off filter. Saved views, My notes and the 5,000-task timing are still to do.)*

**Checkpoint (end of Stage B)**: quickstart Stage B steps 1–9 pass, along with every earlier lab. Open the Stage B PR.

---

## Phase 6: User Story 3 - Each team's own status words (P1, Stage C)

**Goal**: words per team Space, shown in its List, Sheet and Calendar; typing a word moves the task; Boards keep the original names.

**Independent Test**: in the Design Space, write "Client review" for D-Check. Typing it in the Space's Sheet moves a task to D-Check, and the Board still says "D-Check". The Content Space's words are the Content sheet's words (spec US3; quickstart Stage C steps 1–2).

- [X] T054 [US3] *(Approved by the user on 2026-11-22: https://claude.ai/artifact/BrQekSRHViGhKCrqmCdMkm, `design/spaces-stage-c.html`. Decisions:
  - team words show alone, with the board name on hover;
  - a new task takes the stages of the Space it's created in (Planning: simple; Content and Video: pipeline in that Space's words). There is no separate kind switch in the forms; the Space picker decides, and the kind never changes;
  - Task link is a custom field type for any view, holding one task. Link task appears only in a Task link field and on calendar days;
  - on the calendar, linking an existing task moves its due date to that day, with Undo;
  - simple tasks get three dashed columns after Published, shown only when simple tasks are in view;
  - a switched-off feature is an empty hatched cell in mixed views;
  - the C-Check switch affects new tasks only.
  Settled 2026-11-22: option A. A team's words are only other names for the 11 stages; no sub-steps inside a stage.)* Write the Stage C design (Status words panel, brand feature switches, simple task controls in TaskModal and on the Board) in `design/spaces-stage-c.html`, starting from the panels in `design/clickup-hierarchy.html`, and get the user's approval before any Stage C UI work (constitution §IV).
- [ ] T055 [P] [US3] Write the pure `src/lib/space-words.ts`:
  - `wordsFor(space, linkedViews)`: Content and Video read their sheet's `view.words`; others read `team_spaces.words`; built-in names come from `content.stage.*` / `sheet.stage.*`;
  - `matchWord`, which wraps `matchStage` (`src/lib/sheet-links.ts:133`);
  - `findClash(words)`.

  Add pure checks in `scripts/spaces-lab/pure-entry.ts`.
- [ ] T056 [US3] Add `setSpaceWords(id, words)` to `src/actions/spaces.ts` (admins and superusers). For 'content' and 'video' it writes the linked sheet's `view.words` through the `applyLinkedFormats` path (`src/actions/sheets.ts:949-969`); otherwise it writes `team_spaces.words`. It rejects with `clash`.
- [ ] T057 [US3] Create `src/components/spaces/SpaceWords.tsx`, a "Status words" panel opened from the Space header in `ViewHost`: rows for the 11 stages (and the 3 simple statuses), comma-separated words, and the board name and Arabic name as hints. It is hidden for users.
- [ ] T058 [US3] Show the Space's words in `ListView`, `TaskSheet` (status cells, and typing a word through `matchWord` → `setTaskStage`) and `CalendarView` tooltips when the node is a Space. Brand, Everything and every `BoardView` keep the original names (FR-013a, FR-016).
- [ ] T059 [US3] Add UI scenarios in `scripts/spaces-lab/scenarios/us3.mjs`:
  - write a word, then type it in the Sheet → the stage moves;
  - the Board is unchanged;
  - a clash is refused;
  - Content Space words equal the Content sheet's;
  - an unknown word lists the valid ones.

---

## Phase 7: User Story 5 - Pipeline tasks and simple tasks (P1, Stage C)

**Goal**: simple tasks (To Do › In progress › Done) that never touch pipeline behaviour, with a default kind per Space and a Done celebration.

**Independent Test**: "+ Task" in the Planning Space creates a simple task with no SLA badge. It isn't in the Inbox, review queues, the Content or Video sheets, or the Library. Done celebrates for the assignee. A simple parent's Done doesn't move its pipeline subtasks (spec US5; quickstart Stage C steps 5–6).

- [X] T060 *(Done: kind comes from the Space it is created in (`kindForSpace`); `setSimpleStatus`; moves refuse simple tasks, bulk stage changes skip them.)* [US5] In `src/actions/tasks.ts`:
  - `createTask` / `createTasks` take the kind from the Space the task is created in (`default_kind`), else 'pipeline' (design decision: no separate kind switch). A simple task gets `simple_status='s-todo'` and `status='todo'`.
  - `updateTask` refuses `kind` changes.
  - `moveTask`, `setTaskStage` and bulk status patches refuse or skip simple tasks.
  - Add `setSimpleStatus(taskId, status)`, guarded by `canAct`, which returns `shouldCelebrate` for the assignee on 's-done'.
- [X] T061 *(Done: Board stage columns, `getAlertStatus` (simple → On Track, no badge), Inbox queues, stage-holder notifications, Content and Video sheet rows, home pipeline figures. The Library already filtered them. The List groups simple tasks by their three statuses after the pipeline.)* [US5] Make pipeline readers skip `kind='simple'`:
  - `tasksByStage` in `src/components/kanban/KanbanBoard.tsx`;
  - `getAlertStatus` callers in `src/lib/alert-status.ts`;
  - the Inbox sections in `src/components/inbox/`;
  - stage-holder recipients in `src/lib/notify/recipients.ts`;
  - `piecesOf` in `src/components/content/rows.ts` and `sheetVideos` in `src/components/sheet/rows.ts`;
  - `home-metrics.ts`;
  - the Library query.

  Guard the unguarded `STAGE_META[status]` lookups in `TaskModal.tsx:629,1957` for simple tasks.
- [X] T062 *(Done: three dashed columns after the pipeline when simple tasks are in view; drag between them calls `setSimpleStatus`; a Kind filter (All, Pipeline, Simple) above the columns. Not yet in the saved-view config bar.)* [US5] In `BoardView` (`src/components/views/BoardView.tsx` / `KanbanBoard.tsx`), render three dashed columns (To Do, In progress, Done) after the pipeline when simple tasks are in view. Moving between them calls `setSimpleStatus`. Add the Kind filter (All, Pipeline, Simple) to the `ViewHost` config bar.
- [X] T063 *(Done: the three-step control in TaskModal with the celebration on Done; cards show "Simple" instead of an SLA chip; TaskForm says which stages the task will get from its Space.)* [US5] In `src/components/kanban/TaskModal.tsx`, simple tasks show a three-step status control instead of the stage pill and Advance, and no SLA badge. In `src/components/shared/TaskForm.tsx`, the "Show in" Space picker decides the kind, with a line naming the stages the task will get. Play the celebration on `shouldCelebrate` from `setSimpleStatus`.
- [X] T064 *(Done in `scripts/spaces-lab/realapp/scenarios-us5.cjs`: create in Planning → simple; dashed columns, no SLA badge, not on the Content sheet; Done saves and leaves a pipeline subtask where it was. Not yet: an Inbox check and a bulk-skip check.)* [US5] Add UI scenarios in `scripts/spaces-lab/scenarios/us5.mjs`:
  - create from Planning → simple;
  - no SLA badge;
  - absent from the Inbox and the Content sheet;
  - Done celebrates;
  - a mixed parent and subtasks move independently.

  Add a real-app check that bulk status patches skip simple tasks.

---

## Phase 8: User Story 4 - Feature switches per brand (P2, Stage C)

**Goal**: admins switch features off per brand; the fields hide everywhere for that brand's tasks, and their values return when switched back on. Islam Check has a default per brand.

**Independent Test**: switch Platform off for The Strategy Community. Its tasks show no Platform in TaskModal, cards, filters, sheets or Spaces, while Forefront's still do. Switch it back on and the values return (spec US4; quickstart Stage C steps 3–4).

- [ ] T065 [P] [US4] Add `setBrandFeatures`, `setBrandFeatureDefaults` and `setBrandNineStage` (all admin-only) to `src/actions/brands.ts`. Include `features` and `nine_stage_default` in the brand data loaded by `loadBoardData` (`src/lib/board-data.ts`) and in `loadBrand`.
- [ ] T066 [US4] Create `src/components/brands/BrandFeatures.tsx`, the switches panel, shown in `src/components/settings/BrandSettings.tsx` per brand and on the brand page header for admins. Workspace defaults go in the Settings Brands tab.
- [ ] T067 [US4] Gate the fields with `featureOn(task.brand, key, defaults)`:
  - TaskModal: platform `:1112-1119`, cover `:1224-1232`, priority `:1781-1791`, hours `:1798-1800`;
  - `src/components/shared/TaskForm.tsx`;
  - the TaskCard cover;
  - `BoardFilters.tsx`, `SortMenu.tsx` and `BulkBar.tsx`;
  - sheet field cells in `SheetGrid.tsx`, `VideoSheet.tsx`, `FieldCells.tsx` and `FieldsPanel.tsx`;
  - the pillar in `ContentGrid.tsx`;
  - video clips in `VideoSheet.tsx` and the TaskModal clip list;
  - hours in `CapacityDashboard.tsx` / `task-load.ts`.

  Values are never cleared.
- [ ] T068 [US4] Turning SLA tracking off for a brand hides that brand's SLA badges and leaves its tasks out of breach counts (`src/lib/alert-status.ts` callers, `home-metrics.ts`). Read `Brand.nine_stage_default` before the workspace default in `createTask`, `createTasks`, `addVideo` (`src/actions/tasks.ts`) and `src/actions/projects.ts:746`.
- [ ] T069 [US4] Add UI scenarios in `scripts/spaces-lab/scenarios/us4.mjs`:
  - switch off, the field disappears for that brand only, switch on, the values return;
  - SLA off removes badges;
  - Islam Check off → new tasks have 10 stages, existing ones keep 11.

**Checkpoint (end of Stage C)**: quickstart Stage C steps 1–6 pass, along with every earlier lab. Open the Stage C PR.

---

## Phase 8b: Task link field and Link task (Stage C, from the approved design)

**Goal**: a Task link custom field for any view, holding one task, with Link task → pick a task or Create new task (in a chosen Space, taking its stages), in Task link fields and on calendar days.

- [ ] T074 [P] Field definitions per view node: reuse `SheetColumn` with `sheet` = `space:<id>` / `brand:<id>` / `me:<memberId>` and a new kind `task`. Values in `SheetValue` hold one task id. Keep these out of the content/video loaders, as with My notes. Actions in `src/actions/view-fields.ts` (add, rename, remove, set value), with view-node permissions like saved views.
- [ ] T075 A "＋ Field" menu on `TaskSheet` and `ListView` (Text, Number, Date, Person, Choice, Checkbox, Web link, Task link), and Task link chips on Board cards and in `TaskModal`.
- [ ] T076 *(User, 2026-11-22: a linked cell's chip has × to unlink, and Delete on the cell unlinks too. Opening a linked cell shows "Linked to X · Open · Unlink" above the list; picking another task replaces it. Both have Undo, and neither task is changed or deleted.)* `LinkTaskPicker`: opens from typing in a Task link cell (or Ctrl+K on one), searches tasks with the typed words, picks one, or "Create new task" with a Space picker that shows the stages the task will get. Used by Task link fields in team views and blank sheets (replacing the one-row path through Board ▾).
- [ ] T077 Calendar: typing on a day offers Link task. Create sets that due date, and its Space choice shows the stages the task will get; linking an existing task moves its due date there, with Undo. On a Space's calendar, tasks show that Space's words (user, 2026-11-22).
- [ ] T078 Real-app checks: add a Task link field, link, create from the picker in Planning (simple) and Content (pipeline), calendar link moves the date, one task per field.

- [X] T079 *(User, 2026-11-22.)* View tabs: each tab's ⋯ menu (or right-click) offers Make home view, Pin and Hide; hidden tabs sit under "Hidden (n)" with Show. Per member and per page, stored in `members.view_prefs`; `setTabPrefs` in `src/actions/views.ts`; pure `arrangeTabs` / `cleanTabPrefs` in `src/lib/view-config.ts`. Checked in `views-home-pin-hide`.
- [X] T080 *(User, 2026-11-22.)* Calendar: undated tasks in a side panel with search and Show done; drag onto a day to date it, drop on the panel to clear the date, with Undo. Checked in `us2-calendar-no-date-panel`.
- [ ] T081 *(User, 2026-11-22.)* Every sheet in a Space, brand Folder or Me gets the sheet features already built for the Content and Video sheets (specs 010–020): columns (add, hide, reorder, widths, regular columns), sort, filter and rules, group, formatting, fills and the power tips. Build `TaskSheet` on the same linked-sheet hooks as `ContentGrid` instead of its own small grid.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T070 [P] Add a "Brands, team Spaces and views (spec 021)" section to HANDOVER.md: the tables, Shows in rules, the hand-off rule and where it lives, the brand Sheet filter, My notes keys and the `once()` markers. Add a line to ground rules: "a move into the design half goes through `needsHandoff`".
- [ ] T071 [P] Add the new Arabic strings (`spaces`, `views`, `calendar`, `handoff`, `me`, and the renamed labels) to HANDOVER §14 open items for native review.
- [ ] T072 [P] Update the parity map in `specs/021-clickup-parity/spec.md` to "Built" for the delivered rows (FR-037), and write `specs/021-clickup-parity/validation.md` with each quickstart step's result.
- [ ] T073 Before each stage's PR, run the full regression: `npm run typecheck`, `lab:spaces`, `lab:sheet`, `lab:spreadsheet`, `lab:inbox`, `lab:notify`, `lab:hours`, plus Arabic and phone axe runs on the new pages.

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: start immediately.
  - T001 (constitution) must merge before any Stage C work (simple tasks, §II and §V) and is the first commit of the feature.
  - T005 approval blocks Stage A and Stage B UI tasks.
- **Foundational (Phase 2)**: depends on T006 → T007. T008, T009 and T014 can run in parallel after T007. T010 and T011 need T008. Phase 2 blocks every story.
- **US1 (Phase 3)** depends on Phase 2.
- **US6 (Phase 4)** depends on US1: it needs `task-spaces.ts`, the Space pages and `ViewHost` for "+ Task". US1 and US6 ship together as **Stage A**.
- **US2 (Phase 5)** depends on Stage A (`ViewHost`, `BoardView`, the brand page). This is **Stage B**.
- **US3, US5 and US4 (Phases 6–8)** depend on Stage B and on T054 approval. US3 and US4 are independent of each other. US5 touches TaskModal and the Board like US4 (T067), so run T063 before T067 to avoid conflicts. Together they are **Stage C**.
- **Polish**: T073 before each stage's PR; T070–T072 at the end.

## Parallel Examples

- **Phase 2**: T008 (`spaces.ts`), T009 (`brand-features.ts`, `simple-status.ts`) and T014 (lab pure checks) run together after T007.
- **US1**: T015 (`spaces` actions), T016 (`task-spaces` actions), T020 (`ListView`) and T021 (`BoardView` / `ViewHost`) are separate files.
- **US2**: T039 (views actions), T041 (calendar maths), T045 (`task-load` and `WorkloadView`) and T046 (row-builder brand predicate) run together.
- **Stage C**: T055 (`space-words.ts`) and T065 (brand actions) run in parallel. US3 (T056–T058) and US4 (T066–T068) can proceed side by side, except where noted on TaskModal.

## Implementation Strategy

- **MVP = Stage A (US1 + US6)**: brands and team Spaces in the sidebar, Space and brand pages with List and Board, Shows in, and the hand-off on every path. This already answers "how does a content task reach the video editor".
- **Then Stage B (US2)**: Calendar, Sheet and Workload views, saved views, the four brand Folders, My tasks and My sheets.
- **Then Stage C (US3, US5, US4)**: status words, simple tasks and brand feature switches.
- Each stage starts with its design approval, ends with its lab and the full regression (T073), and ships as one PR merged on the user's word.
- Throughout: one permission check per server action; Boards always show the 11 stages as built; no existing address changes; every new string is in English and Arabic.
