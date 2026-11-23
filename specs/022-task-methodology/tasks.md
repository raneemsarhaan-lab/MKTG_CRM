---
description: "Tasks for 022 — task methodology"
---

# Tasks: Task methodology — one pipeline, media links, Space stages

**Input**: `specs/022-task-methodology/` — plan.md, spec.md, research.md (R1–R18), data-model.md, contracts/, quickstart.md
**Tests**: included. Every phase in this project ends with its lab checks (constitution "Testing"): pure checks in `scripts/spaces-lab/pure.mjs`, real-app scenarios in `scripts/spaces-lab/realapp/`.
**Rules**: branch only, nothing merged to `main`; commit locally at the end of each phase; push only when the user says.

## Format: `- [ ] [ID] [P?] [Story] Description with file path`

---

## Phase 1: Setup (gates before any code)

**Purpose**: constitution amendment and the design file the UI must match (plan "Constitution Check": §II, §IV, §V).

- [ ] T001 Amend `.specify/memory/constitution.md` to 4.0.0 (MAJOR):
  - §II has one workflow; the simple-task section is removed.
  - Media tasks are added, with the "waiting on media" and "follows content" rules inside `allowedStages`.
  - SLA counts working days by the Settings › Due Dates weekend, on Cairo days.
  - The hand-off creates linked media tasks.
  - §V drops the simple-task celebration; migrated tasks never celebrate.
  - §VI adds `MediaBoard` to the type list.
  - The Tech stack note "reorder within a column" is corrected.
  - The Sync Impact Report is updated.
- [ ] T002 Write `design/task-methodology.html` (tokens only, en + ar copy) covering every screen in `contracts/ui.md`:
  - the hand-off box with one person picker per board;
  - Design/Video board header with Link task / Create task and the Link task list (board choice);
  - media cards (linked, after D-Check "with Content", unlinked);
  - content card and panel chips with Unlink;
  - Space settings › Stages (rename, split, reorder, remove);
  - Settings › Spaces default role;
  - Settings › SLA & Workflow boards per content type.
- [ ] T003 Publish the design for review and record the user's approval of the design and of research R10–R14 at the top of `specs/022-task-methodology/research.md`. **Gate: Phases 4–8 UI tasks wait for this.**

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: schema, types and loaders every story reads.

- [ ] T004 Add to `prisma/schema.prisma`:
  - `tasks`: `media_board`, `content_task_id` (FK → tasks, set null; partial unique index with `media_board`), `entry_stage` (default `'todo'`), `auto_linked_at`, `migrated_simple`.
  - `team_spaces`: `default_assignee_role`, `media_board`.
  - `content_types`: `media_boards text[]` (default `{design}`).
  - New models `SpaceStage` (`space_stages`) and `TaskSpaceStage` (`task_space_stages`), as in `data-model.md`.
  - Run `prisma db push` and `prisma generate` locally.
- [ ] T005 [P] Add `MediaBoard = 'design' | 'video'` and the fields `media_board`, `content_task_id`, `entry_stage`, `auto_linked_at`, `migrated_simple` on `Task`, `default_assignee_role`, `media_board` on `TeamSpace`, and `SpaceStage` / `TaskSpaceStage` types in `src/types/index.ts`.
- [ ] T006 [P] Map the new fields in `src/lib/mappers.ts` (`mapTask`, `mapSpace`, new `mapSpaceStage`).
- [ ] T007 Load `space_stages` and `task_space_stages` (two flat queries) and `content_types.media_boards` in `src/lib/board-data.ts`, returned as `spaceStages`, `taskSpaceStages`, and on `contentTypes`.
- [ ] T008 [P] Export the new pure libs from `scripts/spaces-lab/pure-entry.ts` (empty modules created in later tasks are added there as they land).

**Checkpoint**: `npm run typecheck` passes; the app loads unchanged.

---

## Phase 3: User Story 1 — Every task is a pipeline task (P1) 🎯 MVP

**Goal**:
- Simple tasks are gone; every task is a pipeline task (11 stages, 10 without C-Check).
- New tasks take their Space's default assignee role.
- Existing simple tasks are migrated.

**Independent test** (quickstart 1–3):
- Create a task in the Content Space: it's assigned to the Content Creator and starts at To Do.
- A brand with C-Check off gives the next task 10 stages.
- A task that was simple "Done" is now Published, with no celebration and not in the Library or on the FFNT Calendar.

### Tests for US1
- [ ] T009 [P] [US1] Pure check `pure-default-assignee` in `scripts/spaces-lab/pure.mjs`: role resolved to the first Space member holding it (by name); none → the creator (R9).
- [ ] T010 [P] [US1] Real-app scenarios in `scripts/spaces-lab/realapp/scenarios-022-us1.cjs` (register in `run.cjs`):
  - create in Content gives the Content Creator, at To Do, pipeline;
  - change the default role in Settings: only the next task follows;
  - C-Check off for a brand gives the next task 10 stages; a task in C-Check still finishes it;
  - a migrated task (seeded simple "s-done") is Published, absent from `/brands/<id>/library` and the brand Calendar.

### Implementation for US1
- [ ] T011 [US1] Revert commit `4fcbc23`'s rule:
  - remove `src/lib/task-kind-server.ts` and its calls in `src/actions/sheet-columns.ts`, `src/actions/sheets.ts` and `src/actions/sheet-links.ts`;
  - `createTask` / `createTasks` in `src/actions/tasks.ts` always create `kind='pipeline'`;
  - subtasks no longer copy a kind.
- [ ] T012 [US1] Add `defaultAssigneeFor(spaceId, ctx)` (pure) in `src/lib/spaces.ts` and use it in `createTask` / `createTasks` (`src/actions/tasks.ts`) when no assignee is given; load the role in `loadSpaceContext` (`src/lib/spaces-server.ts`).
- [ ] T013 [US1] Add `default_assignee_role` to `updateSpace` / `createSpace` (admin-only) in `src/actions/spaces.ts`, and a role picker `[data-space-default-role]` per Space in `src/components/settings/SpacesSettings.tsx` (per T002).
- [ ] T014 [US1] TaskForm (`src/components/shared/TaskForm.tsx`):
  - preselect the Space's default assignee;
  - remove `data-gets-stages` simple wording and `spaceKinds`;
  - update callers in `src/components/kanban/KanbanBoard.tsx`.
- [ ] T015 [US1] Remove simple-task UI:
  - the dashed simple columns, the Kind filter and `setSimpleStatus` calls in `src/components/kanban/KanbanBoard.tsx` / `KanbanColumn.tsx`;
  - the simple groups and `simpleName` in `src/components/views/ListView.tsx`;
  - the three-step control in `src/components/kanban/TaskModal.tsx`;
  - the simple branches in `src/components/views/TaskSheet.tsx` and `src/components/views/SpacePage.tsx`;
  - the "Simple" chip in `src/components/kanban/TaskCard.tsx`.
- [ ] T016 [US1] Remove simple-task server paths:
  - `setSimpleStatus` and the simple guards in `src/actions/tasks.ts`;
  - `kind === 'simple'` branches in `src/lib/alert-status.ts`, `src/lib/stage-moves.ts`, `src/lib/spaces.ts`, `src/lib/inbox.ts`, `src/lib/task-load.ts`, `src/lib/due-dates.ts` (`isOverdue`), `src/components/content/rows.ts` and `src/lib/home-metrics.ts`.
  - Keep the DB columns (R16).
- [ ] T017 [US1] Migration `once('simple-to-pipeline-v1')` in `prisma/seed.ts`:
  - s-todo → todo, s-doing → c-prog, s-done → publish;
  - `kind='pipeline'`, `simple_status=null`, `migrated_simple=true`;
  - `stage_date` = today for todo and c-prog;
  - no notifications.
- [ ] T018 [US1] Skip `migrated_simple` tasks in the celebration path (`src/actions/tasks.ts` `shouldCelebrate`), in `src/components/brands/BrandLibrary.tsx` / the Library filter in `src/components/views/BrandPage.tsx`, and on the brand Calendar's published markers (`src/components/views/CalendarView.tsx`).
- [ ] T019 [US1] Remove `spaces.words`-unrelated simple strings and keys from `messages/en.json` and `messages/ar.json` (simple statuses, kind filter, startsSimple) and the `pure-simple-status` check from `scripts/spaces-lab/pure.mjs`; replace `scenarios-us5.cjs` with a note pointing to US1 tests.

**Checkpoint**: US1 tests pass; `lab:spaces`, `lab:sheet`, typecheck green.

---

## Phase 4: User Story 2 — Ready For Design links content to media (P1)

**Goal**:
- A content task reaching Ready For Design for the first time gets one linked media task per needed board.
- The hand-off box asks for a person per board.
- The content task waits until every media task passes D-Check, then moves to F-Check.

**Independent test** (quickstart 4–5): a Reel at Ready For Design produces a linked Video media task with the chosen editor. With a type set to Design + Video, the content task reaches F-Check only after both media tasks pass D-Check.

### Tests for US2
- [ ] T020 [P] [US2] Pure check `pure-media-gate` in `scripts/spaces-lab/pure.mjs`:
  - `contentStageFrom(media[])` = earliest of r-design/d-prog/d-check;
  - `mayLeaveDCheck` only when all passed;
  - `boardsFor(type)` from `media_boards`.
- [ ] T021 [P] [US2] Real-app scenarios `scripts/spaces-lab/realapp/scenarios-022-us2.cjs`:
  - Reel to Ready For Design: the box shows Video with the default editor; confirm creates the media task;
  - a Design+Video type gives two media tasks; D-Check passed on one only refuses the content move; both passed puts the content task at F-Check;
  - skip in the box gives each board Space's default assignee;
  - a second time at Ready For Design (after a move back) never links again.

### Implementation for US2
- [ ] T022 [P] [US2] Create `src/lib/media.ts` (pure): `boardsFor(type, contentTypes)`, `contentStageFrom(mediaTasks)`, `allMediaPassed(mediaTasks)`, `followsContent(mediaTask)` (R2, R3, R6).
- [ ] T023 [US2] In `src/lib/stage-moves.ts` (`allowedStages`):
  - refuse moves of a content task past D-Check while linked media tasks haven't passed (`waiting_on_media`);
  - refuse moves of a linked media task after its D-Check (`follows_content`).
  - Feed media tasks in through the existing context argument.
- [ ] T024 [US2] Create `src/actions/media.ts` with `linkToMedia(contentTaskId, boards, people?)` per `contracts/server-actions.md`:
  - permission check;
  - one media task per board at `r-design`, `media_board` set, `content_task_id` set;
  - its `stage_date` set when the content task reaches Ready For Design (R10);
  - it shows in that board's Space;
  - sets `auto_linked_at` when called from the hand-off.
- [ ] T025 [US2] In `moveTask` (`src/actions/tasks.ts`):
  - a content task entering `r-design` with `auto_linked_at` null returns `{ handoff: { boards, suggested } }`;
  - a linked media task passing D-Check: if it's the last, move the content task to F-Check in the same call (notify its owner);
  - while media tasks are open, keep the content task's stage = `contentStageFrom(...)`.
- [ ] T026 [US2] Hand-off box in `src/components/handoff/` (`request.ts` and the dialog):
  - one row per board `[data-handoff-board]` with a person picker `[data-handoff-person]` defaulting to the board Space's default assignee;
  - Confirm and Skip both call `linkToMedia` (per T002).
- [ ] T027 [US2] `setContentTypeBoards(label, boards)` (admin) in `src/actions/settings.ts`, and the per-type board choice `[data-type-boards]` in `src/components/settings/WorkflowSettings.tsx`.
- [ ] T028 [US2] Migrations in `prisma/seed.ts`:
  - `once('content-type-boards-v1')`: Video and Reel → `{video}`, others → `{design}`;
  - `once('space-default-roles-v1')`: Content → Content Creator, Design → Graphic Designer, Video → Video Editor, plus `media_board` on Design/Video.
- [ ] T029 [US2] Migration `once('media-tasks-v1')` in `prisma/seed.ts`:
  - content tasks at `r-design` or later that show in Design/Video get one linked media task per board (same stage, or following if past D-Check), with the current assignee;
  - `auto_linked_at` is set;
  - their Design/Video `task_spaces` rows are removed.
- [ ] T030 [US2] Strings for the box, gate refusals (`waiting_on_media`, `follows_content`) and type boards in `messages/en.json` and `messages/ar.json`.

**Checkpoint**: US2 tests pass, US1 still green.

---

## Phase 5: User Story 3 — Media boards: Link task, Create task, Unlink (P1)

**Goal**:
- Design and Video boards hold media tasks only, with Link task and Create task.
- Content and DMS (and admins) can unlink.
- Assigning a designer doesn't link.

**Independent test** (quickstart 6–9):
- Create task on Design gives an unlinked media task at Ready For Design.
- Link task on Video attaches a content task.
- A Content Creator can unlink; a designer can't.
- A designer assigned to an unlinked content task sees it in My tasks only.

### Tests for US3
- [ ] T031 [P] [US3] Real-app scenarios `scripts/spaces-lab/realapp/scenarios-022-us3.cjs`:
  - Create task on Design: `entry_stage='r-design'`, SLA counted from there;
  - Link task on Video for a content task at C-In Progress: the media task is in Ready For Design and its SLA starts when the content task reaches it;
  - Link task doesn't offer content tasks at F-Check or later;
  - unlink as Content Creator: both stay, unlinked; as Graphic Designer: refused;
  - designer as assignee of an unlinked content task: in their My tasks, not on the Design board.

### Implementation for US3
- [ ] T032 [US3] `createMediaTask(board, input)` and `unlinkMedia(mediaTaskId)` in `src/actions/media.ts` per contract (role checks: board Space members/superuser/admin for create; Content Creator, DMS, admin for unlink; R4, R14).
- [ ] T033 [US3] `src/components/media/MediaActions.tsx` (new):
  - Link task `[data-media-link]` opens a searchable list `[data-media-pick]` of content tasks not on this board and before F-Check, with the board choice `[data-media-board]`;
  - Create task `[data-media-create]` opens the task form preset to the board.
  - Rendered in the Design/Video Space header via `ViewHost` actions in `src/components/views/SpacePage.tsx` (per T002).
- [ ] T034 [US3] Media boards show media tasks only:
  - in `src/components/views/SpacePage.tsx`, a Space with `media_board` scopes to `media_board = that board`;
  - in `src/components/kanban/TaskCard.tsx`, media cards show `[data-media-card]`, the content task name (`[data-media-linked]`, opens it), "with Content" read-only after D-Check, or an "Unlinked" tag.
- [ ] T035 [US3] Content task chips `[data-media-chip]` (board + stage) on `src/components/kanban/TaskCard.tsx` and in `src/components/kanban/TaskModal.tsx`, with Unlink `[data-media-unlink]` beside each for allowed roles.
- [ ] T036 [US3] In `src/lib/spaces.ts`, `spacesForAssignee` and `creatorSpaces` never return a Space with `media_board` for a content task (FR-007). In `src/components/me/MyTasks.tsx`, keep tasks assigned to the member regardless of Space.
- [ ] T037 [US3] Dropping a content task unlinks its media tasks in the same action (`src/actions/tasks.ts` drop path).
- [ ] T038 [US3] Strings for Link task, Create task, Unlink, "with Content", "Unlinked" in `messages/en.json` and `messages/ar.json`.

**Checkpoint**: US1–US3 tests pass. **MVP complete** (one pipeline, media boards working).

---

## Phase 6: User Story 4 — Space stages (P2)

**Goal**:
- Each Space renames or splits original stages.
- Sub-stage moves change only that Space.
- Sheets use their Space's stages.
- The main board keeps the original names.

**Independent test** (quickstart 11–12):
- Split D-In Progress into Sketch / Final art in Design. A move between them changes nothing else; leaving and re-entering starts at Sketch.
- Renaming C-In Progress to "Writing" shows on the Content sheet.

### Tests for US4
- [ ] T039 [P] [US4] Pure check `pure-space-stages` in `scripts/spaces-lab/pure.mjs`:
  - validation (every stage covered, unique names, one stage per row);
  - `spaceStageOf(task, space, rows)`: a remembered row counts only while `status` matches, else the first.
- [ ] T040 [P] [US4] Real-app scenarios `scripts/spaces-lab/realapp/scenarios-022-us4.cjs`:
  - split and rename in Space settings; a mapping missing a stage is refused;
  - a sub-stage move by a Space member leaves `status`, `stage_date` and other Spaces unchanged;
  - re-entering the stage starts at the first sub-stage;
  - the Content sheet shows and accepts the Content Space's names;
  - `/board` shows the original names.

### Implementation for US4
- [ ] T041 [P] [US4] Create `src/lib/space-stages.ts` (pure): `validateStages`, `spaceStageOf`, `stagesForSpace` (ordered, with fallback names), `matchSpaceStage(text, rows)` (names + aliases, en/ar original names), replacing `src/lib/space-words.ts` call sites.
- [ ] T042 [US4] Create `src/actions/space-stages.ts` with `saveSpaceStages` (admin, superuser) and `moveSubStage` (Space access; `other_stage` refusal) per contract.
- [ ] T043 [US4] `src/components/spaces/SpaceStages.tsx` (new, replaces `SpaceWords.tsx`): the 11 originals with their Space stages, rename, ＋ split, reorder, remove (not the last) `[data-space-stage-row]` `[data-space-stage-add]`. Opened from the Space header for admins and superusers (per T002).
- [ ] T044 [US4] Space views by Space stage in `src/components/views/SpacePage.tsx`, `ListView.tsx`, `CalendarView.tsx` (chip tooltip) and the Space Board (`src/components/views/BoardView.tsx` → `KanbanBoard` columns per Space stage):
  - a drag or menu between Space stages of one original stage calls `moveSubStage`; otherwise the normal move;
  - `[data-space-stage]` on columns and pills.
- [ ] T045 [US4] Sheets read their Space's stages:
  - `src/components/views/TaskSheet.tsx`;
  - Content and Video sheets via `src/components/content/ContentGrid.tsx` / `src/components/sheet/SheetGrid.tsx` status words (`stageWord`);
  - typing a Space stage name moves to it (sub-stage or real move).
  - Retire the sheets' own words settings (`view.words`, the Words panel) in `src/components/sheet/useLinkedView.ts` and its menu.
- [ ] T046 [US4] Migration `once('space-stages-v1')` in `prisma/seed.ts`: per Space and original stage, one row named by the first status word (else null), other words as aliases. Content/Video take theirs from `sheets.view.words.stage` (R8).
- [ ] T047 [US4] Remove `setSpaceWords`, `src/components/spaces/SpaceWords.tsx`, `src/lib/space-words.ts` (after T041), `scenarios-us3.cjs`, `pure-space-words`, and the `spaces.words` strings. Keep the `words` columns (R16).
- [ ] T048 [US4] Strings for Space stages in `messages/en.json` and `messages/ar.json`.

**Checkpoint**: US4 tests pass; US1–US3 still green.

---

## Phase 7: User Story 5 — Where tasks show (P2)

**Goal**: "Shows in" covers:
- the created-in, creator's and assignee's Spaces;
- the old assignee's Space is removed under the rule;
- once per Space, in its stage names;
- brands show all their tasks.

**Independent test** (quickstart 10): change the assignee; the old assignee's Space goes unless it was the created-in Space.

- [ ] T049 [P] [US5] Pure check additions in `pure.mjs`: `spacesToDropOnAssigneeChange(rows, oldAssignee, createdIn)`.
- [ ] T050 [P] [US5] Real-app scenario in `scripts/spaces-lab/realapp/scenarios-022-us5.cjs`: assignee change from a Content member to a Planning member drops Content (added for the assignee) but keeps it when Content was the created-in Space.
- [ ] T051 [US5] In `updateTask` and `bulkUpdateTasks` (`src/actions/tasks.ts`), delete the old assignee's `added_via='assignee'` rows unless the Space also has a `created`/`manual` row (`src/lib/spaces-server.ts` helper).
- [ ] T052 [US5] Confirm each Space lists a task once and in its stage names (`src/components/views/SpacePage.tsx`); brand pages unchanged (`BrandPage.tsx`).

**Checkpoint**: US5 tests pass.

---

## Phase 8: User Story 6 — SLA on working days (P2)

**Goal**:
- SLA counts the working days of the Settings weekend (Sunday–Thursday by default) on Cairo days.
- Media-made tasks count from Ready For Design.

**Independent test** (quickstart 13): a task entering a stage on Thursday shows 1 day in stage on Sunday.

- [ ] T053 [P] [US6] Pure check `pure-sla-days` in `pure.mjs`:
  - Thursday → Sunday = 1 with weekend `{5,6}`;
  - Cairo midnight edge;
  - `entry_stage` skips earlier stages in reports.
- [ ] T054 [US6] `businessDaysBetween(from, to, weekend)` on Cairo days in `src/lib/utils.ts`; callers pass `dueRule.weekend` (`src/lib/alert-status.ts`, `src/lib/inbox.ts`, `src/lib/workload.ts`, board data `today`).
- [ ] T055 [US6] Reports and alerts skip stages before `entry_stage` (`src/lib/alert-status.ts`, `src/lib/home-metrics.ts`).
- [ ] T056 [US6] Real-app check in `scenarios-022-us3.cjs` (extend): a media-made task shows no SLA for content stages.

**Checkpoint**: all stories pass independently.

---

## Phase 9: Polish & cross-cutting

- [ ] T057 [P] Rename the Task link field to **Related task**:
  - `sheet.columns.kinds.task`, `kindHelp.task`, `taskLink.*` titles in `messages/en.json` / `messages/ar.json`;
  - picker title in `src/components/sheet/LinkTaskPicker.tsx`;
  - ＋ Field item in `src/components/views/TaskSheet.tsx`;
  - update `scenarios-tasklink.cjs` labels (R18).
- [ ] T058 [P] Move the due-date migration into `once('due-dates-v1')` in `prisma/seed.ts`, skipping when `workspace_settings.due_dates_migrated_at` is set. Remove its step from `scripts/migrate.sh` (R15).
- [ ] T059 [P] Remove now-unused code: `kindForSpace`, `TaskKind` / `SimpleStatus` uses, `default_kind` reads, `src/lib/simple-status.ts`, `SpacesSettings` default kind remnants.
- [ ] T060 Arabic review of every new string (`messages/ar.json`) against the design file's Arabic copy.
- [ ] T061 Full regression:
  - typecheck;
  - `lab:spaces`, `lab:sheet`, `lab:inbox`, `lab:notify`, `lab:spreadsheet`;
  - every real-app scenario;
  - quickstart 1–14 by hand;
  - previews in `design/previews/022/`.
- [ ] T062 Update `HANDOVER.md` (the methodology in brief, migrations, where each rule lives) and mark spec 021 US3/US5/T074–T078 superseded in `specs/021-clickup-parity/tasks.md`.

---

## Dependencies & execution order

- **Phase 1** (T001–T003) first. T003 is the approval gate for all UI tasks (T013, T014, T026, T027, T033–T035, T043–T045).
- **Phase 2** (T004–T008) blocks every story.
- **US1** (Phase 3) blocks US2 and US3, which need one workflow.
- **US2** before **US3**: US3 reuses `actions/media.ts` and the gate from US2.
- **US4**, **US5**, **US6** need only Phase 2 + US1. They can run beside US2/US3, but each touches different files except where noted:
  - US4 and US3 both edit `SpacePage.tsx`, so do T034 before T044;
  - US6's T054 touches `alert-status.ts` after US1's T016.
- **Polish** last.

## Parallel examples

- **Phase 2**: T005 and T006 together (different files) after T004.
- **US1**: T009 and T010 (tests) together; T013 and T014 together.
- **US2**: T020, T021 and T022 together.
- **US4**: T039, T040 and T041 together; T043 after T042.
- **Across stories** after US1: US5 (T049–T052) and US6 (T053–T056) beside US2.

## Implementation strategy

1. **MVP = Phases 1–5 (US1–US3)**: one pipeline, default assignees, media boards with automatic and manual linking. Stop and validate quickstart 1–9, commit, and ask the user to review.
2. **Then US4** (Space stages), the largest UI change, validated with quickstart 11–12.
3. **Then US5 and US6**, small rule changes.
4. **Polish**, full regression, handover.
5. Each phase ends with a local commit. Pushes only when the user says; nothing to `main`.
