---

description: "Task list for Link a Blank Sheet's Columns to Board Tasks (spec 016)"
---

# Tasks: Link a Blank Sheet's Columns to Board Tasks

**Input**: Design documents from `specs/016-sheet-task-links/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: As in specs 013–015, each story is checked with:
- pure checks (`lab:spreadsheet`);
- a server smoke test on PostgreSQL;
- running-app checks (`realapp/links.cjs`).

So lab tasks are included per story. There is no separate unit-test framework.

**Organization**: Tasks are grouped by user story (spec.md US1–US4). The feature ships as one PR.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unfinished dependency).
- **[Story]**: US1–US4 from spec.md.

---

## Phase 1: Setup

**Purpose**: The design gate and the lab skeleton.

- [ ] T001 Write `design/sheet-task-links.html` (constitution §IV), publish it as an artifact and get the user's approval **before any UI task**. It uses `--sh-*` / `--fx-*` tokens and shows (contracts/ui.md):
  - the Board ▾ menu in the toolbar's Editing group and in the sheet tab menu;
  - the Link to board dialog: step 1 (choose the Task column), step 2 (map fields; picked fields greyed out elsewhere), the result line "9 linked · 1 not found · 1 to choose";
  - a linked blank sheet: badges on mapped headings, the task marker in row numbers, the linked tint, a Stage pill and member names in mapped cells, the "Not linked" / "2 tasks have this title" / "Task removed" notes, a "Not applicable" cell on a video row;
  - a refused edit's note, and the "N not changed (you can't edit them)" message;
  - Choose a task, Add tasks… (search, filters, ticks) and the Create tasks for rows preview (to create, problems fixed in place or left out, one shared due date);
  - a 390 px phone (full-screen dialogs, 44 px targets) and Arabic (RTL).
- [ ] T002 [P] Extend the lab: export `@/lib/sheet-links` from `scripts/spreadsheet-lab/pure-entry.ts`. Add a "links" section to `scripts/spreadsheet-lab/pure.mjs` and to `scripts/spreadsheet-lab/smoke/run.ts`. Create `scripts/spreadsheet-lab/realapp/links.cjs`, which seeds a team folder with a 10-row plan sheet (8 task links, 1 exact title, 1 unknown title) and removes it at the end.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: Schema, types, the pure module and the undo kinds every story uses.

- [ ] T003 Add the schema in `prisma/schema.prisma` (data-model §1):
  - `task_id String? @db.Uuid` on `SheetRow`, with a relation to `Task` (`onDelete: SetNull`) and `@@index([task_id])`;
  - the back-relation `sheet_rows SheetRow[]` on `Task`;
  - `task_map Json?` on `Sheet`.

  Apply it with `bash scripts/migrate.sh`.
- [ ] T004 [P] Add the types to `src/types/index.ts` (data-model §2):
  - `TaskField`, `SheetTaskMap`, `TaskFieldValues`, `LinkedTask`, `TaskFieldWrite`, `TaskFieldResult`;
  - `SheetExtras.taskMap`, `rowTasks` and `tasks`;
  - `SheetChanges.taskMap` and `rowTasks`.
- [ ] T005 [P] Write the pure module `src/lib/sheet-links.ts` (research R2–R4, R11):
  - `taskIdFrom(text)`: a uuid from `/board?task=…`, a full URL or a bare uuid;
  - `normTitle(text)`;
  - `matchCells(cells, byId, byTitle)` → `{ linked, ambiguous, unmatched }`;
  - `cleanMap(map, colIds, teamColIds)`, which drops bad entries, the Task column as a field and duplicate fields;
  - `FIELD_APPLIES(task)`, the fields a task has: Theme and Pillar for Content pieces only; links for pieces and videos;
  - `shownValue(task, field, names, stageNames)`, the text a mapped cell shows;
  - `TASK_FIELDS`, the field list in menu order.
- [ ] T006 Add the undo kinds `taskMap`, `rowTasks` and `taskFields` to `src/lib/sheet-undo.ts` (`invert`), and their apply and server mapping to `src/lib/sheet-doc.ts` (`applyChange`, `toServer`, `mergeServer`):
  - `taskMap` → `changes.taskMap`;
  - `rowTasks` → `changes.rowTasks`;
  - `taskFields` is applied on screen only. It is saved through `writeTaskFields`, not the outbox (data-model §3).

  Count the new parts in `src/components/sheets/useOutbox.ts`.
- [ ] T007 Load and save in `src/actions/sheets.ts` (contracts/server.md "Loading", "Mapping and links"):
  - `loadExtras` returns `taskMap`, `rowTasks` and `tasks`, with only the mapped fields. Each `LinkedTask` has `editable` (`canAct`) and `applies`.
  - `applySheetChanges` takes `taskMap` (cleaned with `cleanMap`) and `rowTasks` (rows on the sheet, tasks that exist; the rest counted as `gone`).
  - Both are refused on a protected sheet for others (`protected`), and on linked sheets (`not_blank`).
- [ ] T008 Add `sheets.links.*` strings to `messages/en.json` and `messages/ar.json` (with Arabic plurals):
  - the menu and dialog labels;
  - the field names;
  - the result line;
  - the notes: Not linked, choose, Task removed, Not applicable;
  - the refusal reasons, matching contracts/server.md;
  - the Create tasks preview and the undo message ("Unlinked; the tasks are kept").
- [ ] T009 Pure checks in `scripts/spreadsheet-lab/pure.mjs`:
  - `taskIdFrom` on a board link, a full URL, a bare uuid and plain text;
  - title matching that ignores case and spaces, with ambiguity;
  - `cleanMap` dropping duplicates, unknown columns and the Task column;
  - `FIELD_APPLIES` for a piece, a video and a project task;
  - the three undo kinds' `invert` and `toServer`.

**Checkpoint**: the foundation is ready, and the stories can start once T001 is approved.

---

## Phase 3: User Story 1 - Connect rows to their tasks (Priority: P1) 🎯 MVP

**Goal**: Pick a Task column. Rows link to their tasks by link or exact title; ambiguous and unmatched rows are reported. Linked rows show a marker that opens the task.

**Independent Test**: quickstart rows 1–2. A 10-row sheet links 9 rows and reports 1 not found. A shared title asks which task; picking one puts its link in the cell; one undo goes back.

- [ ] T010 [US1] Server actions in `src/actions/sheet-links.ts` (contracts/server.md):
  - `linkColumn(sheetId, colId)` resolves every row in two queries (R3, R12) and saves `task_id` with one `unnest` update;
  - `resolveTaskCells(sheetId, cells)`, for typed or pasted Task cells, up to 2,000;
  - `searchTasks(query, filters)`, up to 50 results, title matches first.

  Each checks `getSessionMember`, `mayEdit` and that the sheet is blank.
- [ ] T011 [US1] Write `src/components/sheets/links/useTaskLinks.ts`, which holds the sheet's `taskMap`, `rowTasks` and `tasks` from `doc.extras`. It:
  - runs `linkColumn` and records one undo step (`taskMap` + `rowTasks` before and after);
  - re-resolves a Task cell after an edit, paste, fill, clear or undo (`resolveTaskCells`), with its own `rowTasks` step;
  - exposes `taskOf(rowId)`, `noteOf(rowId)` (`notLinked`, `choose`, `removed`, `dropped`) and `openTask(taskId)` (the board's task modal route `/board?task=`).
- [ ] T012 [US1] The Link to board dialog, step 1, in `src/components/sheets/links/LinkDialog.tsx` (`data-link-board`):
  - lists columns by their first row's text;
  - links on Next;
  - shows the result line with Review and Done.

  Open it from a Board ▾ button in the Editing group of `src/components/sheets/format/FormatToolbar.tsx` (blank sheets only), and from the sheet tab menu in `src/components/sheets/Workbook.tsx`.
- [ ] T013 [US1] In `src/components/sheets/BlankSheet.tsx`:
  - the task marker in a linked row's number (`data-task-marker`, `rowLabel`), which opens the task;
  - the Task cell's note (`data-link-note`) for Not linked, "2 tasks have this title", Task removed and dropped;
  - Task cell edits routed through `useTaskLinks`.
- [ ] T014 [P] [US1] Choose a task in `src/components/sheets/links/ChooseTask.tsx` (`data-choose-task`):
  - the matching tasks, with stage, project and assignee;
  - a search over `searchTasks`.

  Picking one sets the row's task and puts its board link in the Task cell, as one undo step.
- [ ] T015 [US1] Styles in `src/app/globals.css`: the marker, the notes, the dialog, Choose a task, and a `--sh-linked` tint made from existing colours (phone sizes included).
- [ ] T016 [US1] Labs:
  - smoke checks in `scripts/spreadsheet-lab/smoke/run.ts` for `linkColumn` (links, titles, ambiguity, unmatched, protected, `not_blank` on the Content sheet) and `resolveTaskCells`;
  - `realapp/links.cjs` sections 1–2 (quickstart rows 1–2), with axe on the dialog and Choose a task.

**Checkpoint**: rows know their tasks; one click from any row to its task.

---

## Phase 4: User Story 2 - Map columns to task fields and edit them both ways (Priority: P1)

**Goal**: Mapped columns show the task's values. Edits save to the task under the board's rules. Board changes come back. Unmapped columns stay sheet cells.

**Independent Test**: quickstart rows 3–9:
- rename, stage and date edits reach the board;
- a disallowed move is refused;
- a member's paste counts what they can't edit;
- a board change shows within 60 s;
- unmapping keeps plain text.

- [ ] T017 [US2] `writeTaskFields(sheetId, writes)` in `src/actions/sheet-links.ts` (research R5, contracts/server.md):
  - for each write: the sheet check, then the task check (`canAct`), then `applies`;
  - it saves through the board's own code: `updateTask` checks for title, due, priority, platform, type and owner; the assignee by member name; `setTaskStage` for stage (with `celebrate`); `updatePiece` for theme and pillar; `setPieceLink` for links; `writePastedValues` for `col:` fields;
  - each saved write's snapshot goes into `sheet_cells`;
  - it returns results and the fresh `tasks`, and calls `revalidatePath('/board')` once.

  Up to 2,000 writes.
- [ ] T018 [US2] `refreshTaskFields(sheetId)` in `src/actions/sheet-links.ts` (R6, R7): linked tasks' mapped fields only; changed snapshots written; `gone` rows unlinked.
- [ ] T019 [US2] Step 2 of `LinkDialog.tsx`: a field picker per column. A picked field is greyed out elsewhere, and choosing it again asks to move it. It saves `taskMap` as one undo step. Badges go on mapped headings (`data-field-badge`, the `header` in `BlankSheet.tsx`).
- [ ] T020 [US2] Mapped cells in `src/components/sheets/BlankSheet.tsx`:
  - On linked rows they show `shownValue`: a stage pill for Stage, member names, dates in the member's language.
  - "Not applicable" cells are muted.
  - Unlinked rows show the snapshot.
  - Edits from typing, paste, Paste Special values, fill, replace, clear and cut go to `writeTaskFields` through `useTaskLinks` as one `taskFields` undo step. Other cells in the same action go to the outbox as before.
  - Refusals show as the cell's note (one cell) or "N not changed (you can't edit them)" (a batch).
  - Undo and redo replay through `writeTaskFields`, and count refusals.
- [ ] T021 [US2] In `src/components/sheets/Workbook.tsx`:
  - call `refreshTaskFields` when the tab is focused again and every 60 s while a linked blank sheet is visible, merging the results into the doc's extras;
  - show `CelebrationOverlay` when a stage write returns `celebrate`.
- [ ] T022 [US2] Unmap and Unlink sheet in `LinkDialog.tsx`: the column's cells keep their snapshots as plain cells. Unlink sheet asks first and is one undo step.
- [ ] T023 [US2] Find & Replace and Sort/Filter on mapped cells in `BlankSheet.tsx` (R11):
  - Find reads `shownValue`;
  - Replace writes through `writeTaskFields`, counting skips;
  - sort and filter read the shown text.
- [ ] T024 [US2] Labs:
  - smoke checks for `writeTaskFields`: owner vs other member, admin, a disallowed move with its reason, `celebrate`, an unknown member, a bad link, `not_applicable` on a video, a team column, snapshots, protected, the 2,000 cap;
  - smoke checks for `refreshTaskFields`: a board change, a deleted task becoming `gone`;
  - `realapp/links.cjs` sections 3–9.

**Checkpoint**: one plan, kept in step with the board without copying.

---

## Phase 5: User Story 3 - Create tasks for rows that have none (Priority: P2)

**Goal**: Unlinked rows become plain board tasks in To do, after a preview. The rows are then linked.

**Independent Test**: quickstart row 10. 4 rows: 3 created and linked, 1 problem. Undo unlinks and keeps the tasks.

- [ ] T025 [US3] `createTasksForRows(sheetId, rows, shared)` in `src/actions/sheet-links.ts` (R8):
  - it needs `requireTaskCreator`;
  - tasks go in `todo`, with the workspace's 8/9-stage default and no project;
  - the owner is the creator unless an Owner value is given;
  - the due date is the mapped one, or the shared one;
  - each gets `createTask`'s followers and notifications;
  - rows are linked and their Task cells get the task link, in one transaction;
  - up to 200 rows.
- [ ] T026 [US3] The preview in `src/components/sheets/links/CreateTasksPreview.tsx` (`data-create-tasks`):
  - the rows to create;
  - problems, fixed in place or left out: no title, an unknown member, a bad date;
  - one due date for rows without one (default 7 days from today).

  On confirm it creates and links. Undo unlinks the rows and keeps the tasks, with a message. Open it from the row menu (when the selection has unlinked rows) and from Board ▾. It is disabled, with the reason, for members who can't create tasks.
- [ ] T027 [US3] Labs:
  - smoke checks for `createTasksForRows`: stage `todo`, no project, owner, notifications, a `user`-access member refused, the 200 cap;
  - `realapp/links.cjs` section 10.

**Checkpoint**: new ideas become tasks without leaving the sheet.

---

## Phase 6: User Story 4 - Keep the sheet's own tools (Priority: P2)

**Goal**: Everything a blank sheet does keeps working on a linked one, and no sheet action ever changes a task.

**Independent Test**: quickstart rows 11–14:
- Add tasks…;
- colour, comment, freeze, move, then delete rows, a column and the sheet;
- no task changes;
- undo restores links and the mapping;
- a protected sheet refuses mapped edits by others.

- [ ] T028 [US4] Add tasks… in `src/components/sheets/links/AddTasks.tsx` (`data-add-tasks`):
  - a search box;
  - filters by stage, person and project;
  - tick boxes over `searchTasks`.

  Add inserts one linked row per task below the selection, with the Task cell holding the link (`insertRows` + `cells` + `rowTasks` in one step). Open it from the row menu and from Board ▾.
- [ ] T029 [US4] Structure in `src/components/sheets/BlankSheet.tsx`:
  - deleting rows keeps their `rowTasks` in the undo step, so undo restores the links;
  - deleting a mapped column removes its `taskMap` entry in the same step (FR-042);
  - deleting the Task column unlinks the sheet's mapping, after asking.

  None of these call a task action.
- [ ] T030 [US4] Labs:
  - smoke check: deleting rows, columns and the sheet leaves the tasks' md5 unchanged (quickstart DB check);
  - `realapp/links.cjs` sections 11–14 (Add tasks, formats and comments on mapped cells, delete and undo, protected sheet).

**Checkpoint**: all four stories work.

---

## Phase 7: Polish and validation

- [ ] T031 [P] Arabic and 390 px phone in `realapp/links.cjs` (quickstart row 16): RTL badges and markers; full-screen dialogs with 44 px targets; axe on every new dialog.
- [ ] T032 [P] Performance (SC-004): link a 2,000-row sheet in under 5 s, and run `perf-axe.cjs` on a linked 5,000-row sheet (arrow keys under 100 ms). Record the numbers.
- [ ] T033 Validation on `next build` + `next start`:
  - `lab:spreadsheet`, smoke, `lab:sheet`, `lab:notify`;
  - realapp `run.cjs`, `perf-axe.cjs`, `format.cjs`, `editing.cjs`, `styles.cjs`, `links.cjs`;
  - tsc.

  Record the results in `specs/016-sheet-task-links/validation.md`.
- [ ] T034 Write `specs/016-sheet-task-links/constitution-check.md`, add a "Sheet task links" section to `HANDOVER.md`, open the PR and ask before merging. Cranl needs a redeploy for the schema.

---

## Dependencies and execution order

- **Phase 1:** T001 (design) must be approved before any UI task: T012–T015, T019–T023, T026, T028–T029. T002 can start at once.
- **Phase 2:**
  - T003 → T004 → T006 and T007;
  - T005 can run alongside T004;
  - T008 any time;
  - T009 after T005 and T006.

  It blocks every story.
- **US1 (Phase 3):** after Phase 2 and T001.
- **US2 (Phase 4):** after US1 (it needs linked rows).
- **US3 (Phase 5):** after US2 (it reads mapped values), but independent of T021–T023.
- **US4 (Phase 6):** after US1. T028 needs T010's `searchTasks`.
- **Polish:** after all stories.

## Parallel examples

```text
Phase 2:  T004 types · T005 sheet-links.ts · T008 strings
US1:      T014 ChooseTask.tsx alongside T013 BlankSheet markers (after T011)
US2:      T017 writeTaskFields and T018 refreshTaskFields (same file: in sequence) · T019 LinkDialog step 2 alongside T017
Polish:   T031 Arabic/phone · T032 performance
```

## Implementation strategy

- **MVP:** US1 alone. Rows know their tasks, and the marker opens each one.
- **Then US2.** It delivers the real value: two-way fields.
- **US3 and US4 complete it.** All of it ships in one PR after T033's validation.
