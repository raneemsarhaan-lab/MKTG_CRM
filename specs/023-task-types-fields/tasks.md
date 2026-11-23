# Tasks: Task Types and Fields

**Input**: Design documents from `specs/023-task-types-fields/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)
**Approved methodology**: `design/task-fields-methodology.html` (decisions recorded 2026-11-23)

**Tests**: included. Each story has real-app scenarios (`scripts/spaces-lab/realapp/scenarios-023-*.cjs`) and pure checks (`scripts/spaces-lab/pure.mjs`), written before the story's implementation, as in specs 021–022.

**Stages**: A (Phases 1–5) → stop → B (Phases 6–8) → stop → C (Phase 9) → stop → D (Phases 10–11) → Polish (Phase 12). Each stop waits for the user's go.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1–US8 from spec.md

---

## Phase 1: Setup — Stage A gates

- [X] T001 **Gate**: confirm with the user that spec 022 has shipped and been tested (spec 023 plan, R14). Nothing below starts before this.
- [X] T002 Amend `.specify/memory/constitution.md` to 4.1.0 (MINOR), part 1: §II — the move rule also refuses a stage while a field required from it is empty; milestones are calendar markers, not tasks. §VI — task types are data (`content_types` gains names, icon, colour, defaults). Update the Sync Impact Report.
- [X] T003 Write `design/023-stage-a.html` (tokens only, en + ar copy) for every Stage A screen in `contracts/ui.md`: Settings › Task types, Settings › Fields (attach, Required from), task panel Fields section, card values, sheet field columns and hatched cells, the refused-move message, Make it a task field, status group filter, milestones on calendars. Publish it for review.
- [X] T004 Record the user's approval of `design/023-stage-a.html` at the top of `specs/023-task-types-fields/research.md`. **Gate: Stage A screen tasks wait for this.**

---

## Phase 2: Foundational — Stage A model (blocks US1–US3)

- [X] T005 In `prisma/schema.prisma`: extend `ContentType` with `name_ar`, `icon`, `color`, `default_priority`, `default_tag_ids`, `default_template_id`, `position`; add `TaskField`, `TaskTypeField`, `TaskFieldValue`, `Milestone` (data-model.md §Stage A). Run `prisma db push`; restart the dev server.
- [X] T006 [P] Types in `src/types/index.ts`: `TaskType` (extends today's `ContentType`), `FieldKind`, `TaskField`, `TaskTypeField`, `FieldValue`, `Milestone`.
- [X] T007 [P] Mappers in `src/lib/mappers.ts` for the new tables.
- [X] T008 Load types, fields, attachments, values (one flat array) and milestones in `src/lib/board-data.ts`.
- [X] T009 `once('task-types-v1')` in `prisma/seed.ts`: icon, colour, `name_ar` and position for each existing type, by label.
- [X] T010 [P] Pure `src/lib/task-types.ts`: the icon set (about 24 names), `typeLabel(type, locale)`, `defaultsFor(type)`.
- [X] T011 [P] Pure `src/lib/task-fields.ts`: kinds, `parseValue(kind, input)`, `formatValue(kind, value, locale)`, `isEmpty`, `fieldsFor(type, attachments, fields)`, `missingRequired(task, attachments, values, target)`, `applies(task, field)`.
- [X] T012 [P] Pure `src/lib/status-groups.ts`: stage → Not started / Active / Done / Closed (research R5).
- [X] T013 Export the new pure helpers from `scripts/spaces-lab/pure-entry.ts`.

**Checkpoint**: Stage A data loads; nothing on screen has changed yet.

---

## Phase 3: User Story 1 — Task types (P1, Stage A)

**Goal**: content types become task types with names, icon, colour and defaults.
**Independent test**: quickstart Stage A step 1.

### Tests for US1
- [X] T014 [P] [US1] Pure check `pure-task-types` in `scripts/spaces-lab/pure.mjs` (defaults for a new task; Arabic name fallback).
- [X] T015 [P] [US1] Real-app scenarios in `scripts/spaces-lab/realapp/scenarios-023-a.cjs`, registered in `run.cjs`: an admin renames Reel in Arabic and sets icon, colour and default priority; a new Reel task shows them; existing Reel tasks keep SLA and Video board; a user sees the page read-only.

### Implementation for US1
- [X] T016 [US1] `src/actions/task-types.ts`: `saveTaskType` (admins; rename cascades; errors `exists`, `invalid`).
- [X] T017 [US1] `src/components/settings/TaskTypesSettings.tsx` in Settings (per `design/023-stage-a.html`), replacing the content-type list; read-only for users.
- [X] T018 [US1] Show the type's icon and colour on cards (`src/components/kanban/TaskCard.tsx`), sheet Type cells (`ContentGrid.tsx`, `SheetGrid.tsx`, `TaskSheet.tsx`) and the task panel (`src/components/kanban/TaskModal.tsx`); Arabic names in Arabic.
- [X] T019 [US1] (moved to Stage B with the new priorities) Apply type defaults (priority now; tags in Stage B; template in Stage D) in `createTask` and `createTasks` (`src/actions/tasks.ts`) when not chosen.
- [X] T020 [US1] Strings `types.*` in `messages/en.json` and `messages/ar.json`.

---

## Phase 4: User Story 2 — Custom fields by task type (P1, Stage A)

**Goal**: a field library attached to types; values on the task everywhere; required from a stage.
**Independent test**: quickstart Stage A steps 2–5.

### Tests for US2
- [X] T021 [P] [US2] Pure checks `pure-task-fields` (every kind parses and formats; empty rules; `missingRequired` at, before and after the stage, on 10- and 11-stage paths; `applies`).
- [X] T022 [P] [US2] Real-app scenarios in `scenarios-023-a.cjs`:
  - create "Caption", attach it to Post required from C-Review; fill it on the Content sheet, see it in the panel and the Planning sheet;
  - empty it; drag, stage menu, sheet typing, bulk and a linked row's move to C-Review are each refused, naming Caption and C-Review;
  - media passing D-Check leaves the content task waiting with "Waiting for Caption";
  - Make it a task field on a task sheet column keeps its values;
  - a Video row under a Post-only field shows a hatched cell that refuses typing.

### Implementation for US2
- [X] T023 [US2] `src/actions/task-fields.ts`: `createField`, `updateField` (kind change converts or keeps as text), `retireField`, `restoreField`, `attachField`, `detachField`, `setFieldValue`, `setFieldValues`, `makeTaskField` (contracts/server-actions.md).
- [X] T024 [US2] Move gate: `requiredGate(task, target)` in `src/lib/media-server.ts`, called with `mediaGate` in `setTaskStage`, `moveTask`, `bulkUpdateTasks` (`src/actions/tasks.ts`) and in `moveThroughMedia`; `syncContent` holds the content task when the field is missing (research R4). Refusal `required_fields` with the field names and stage.
- [X] T025 [US2] Refusal messages on every path: board drag (`KanbanBoard.tsx`), panel stage menu (`TaskModal.tsx`), sheets (`ContentSheet.tsx`, `VideoSheet.tsx`, `TaskSheet.tsx`), bulk notes; in the Space's stage names where shown.
- [X] T026 [US2] `src/components/settings/FieldsSettings.tsx`: the library, New field, options with colours, attach to types with Required from (stage menu) and default value.
- [X] T027 [US2] `src/components/fields/FieldEditor.tsx` and `FieldCell.tsx`: one editor per kind (text, number, money, date, link, person, choice, multi, checkbox, rating, related task), used by the panel, sheets and cards.
- [X] T028 [US2] Task panel Fields section `src/components/fields/FieldsSection.tsx` in `TaskModal.tsx`, marking required fields with their stage.
- [X] T029 [US2] Sheets: task fields as `f:<id>` columns in `src/components/sheet/useSheetColumns.tsx` (shown when any row's type has the field), editing through `setFieldValues` (typing, paste, fill, undo), hatched cells where the field doesn't apply; Content, Video and task sheets.
- [X] T030 [US2] Make it a task field: column menu item in `src/components/sheet/useSheetColumns.tsx` (admins, superusers; task sheets only) calling `makeTaskField`.
- [X] T031 [US2] Cards: fields with `on_card` under the title (`TaskCard.tsx`); fields on List rows; the Fields button (standard + custom + "+ Field"). Filters and group-by by a field's value are left for polish (T086).
- [X] T032 [US2] Brand switch for switchable fields (`src/lib/brand-features.ts`): hidden for that brand everywhere.
- [X] T033 [US2] Strings `fields.*` in both message files.

---

## Phase 5: User Story 3 — Status groups and milestones (P2, Stage A)

**Goal**: report grouping by status group; milestones on calendars.
**Independent test**: quickstart Stage A steps 6–7.

### Tests for US3
- [X] T034 [P] [US3] Pure check `pure-status-groups` (every stage of both paths; Space stages inherit).
- [X] T035 [P] [US3] Real-app scenarios in `scenarios-023-a.cjs`: group a Space's list by status group; add a Forefront milestone, see it on Forefront's and the Content Space's calendars, not draggable; a user can't add one.

### Implementation for US3
- [X] T036 [US3] Status group in filters and list group-by (`BoardFilters.tsx`, `ListView.tsx`).
- [X] T037 [US3] `src/actions/milestones.ts` (admins, superusers).
- [X] T038 [US3] Milestones in `src/components/views/CalendarView.tsx`: flag chips on their day, Add milestone on a day, rename/move/delete; brand, Space and My tasks calendars.
- [X] T039 [US3] Strings `milestones.*`, `statusGroups.*`.

**Checkpoint — Stage A stop**: run the full regression (typecheck, every lab, every real-app scenario, axe in Arabic and on a phone); commit; previews of the new screens; wait for the user's go.

---

## Phase 6: Setup and model — Stage B

- [X] T040 Amend the constitution to 4.1.0 part 2 (or 4.2.0 if part 1 shipped separately): §II working stages are held by the owner or any assignee; §VI `Priority` union becomes Urgent | High | Normal | Low | None.
- [X] T041 (built without a separate design page — see research R17; screenshots at the Stage B stop) Write `design/023-stage-b.html` (priority menus, Urgent flag, tag picker and chips, Settings › Tags with merge, assignees picker with lead and hours, cards with avatars); publish; record approval in `research.md`. **Gate for Stage B screens.**
- [X] T042 Schema: `Tag`, `TaskTag`, `TaskAssignee`; default priority `Normal` (`prisma/schema.prisma`); `db push`; restart.
- [X] T043 `src/types/index.ts`: `Priority` union, `Tag`, `Assignment`; brand feature key `tags`.
- [X] T044 `once('priority-normal-v1')` (Medium → Normal) and `once('assignees-v1')` (each assignee at position 0) in `prisma/seed.ts`.
- [X] T045 [P] Pure `src/lib/tags.ts` (name normalising, merge plan) and `src/lib/assignees.ts` (lead, workload split).

---

## Phase 7: User Story 4 — Priorities and tags (P2, Stage B)

**Independent test**: quickstart Stage B steps 8–9.

### Tests for US4
- [X] T046 [P] [US4] Pure checks `pure-priorities` (sort with Urgent first; English and Arabic typing) and `pure-tags` (normalising, merge without duplicates).
- [X] T047 [P] [US4] Real-app scenarios in `scripts/spaces-lab/realapp/scenarios-023-b.cjs`: Medium reads Normal; Urgent sorts first and notifies the assignee; SLA badge unchanged; create "Eid" while tagging, filter by it; admin merge into "Eid 2026"; brand switch hides tags.

### Implementation for US4
- [X] T048 [US4] Priority values everywhere they're chosen or typed: `TaskModal.tsx`, `TaskForm.tsx`, `src/lib/sheet-links.ts` (`matchPriority`), sheet menus, bulk; Urgent flag colour from tokens.
- [X] T049 [US4] Urgent first in default sorts (`src/lib/board-sort.ts` or the sort helpers used by board, list and sheets).
- [X] T050 [US4] Notification kind `urgent` (`src/lib/notify/*`, settings order, push on by default); `updateTask` sends it when priority becomes Urgent.
- [X] T051 [US4] `src/actions/tags.ts` (`setTaskTags`, `createTag`, `renameTag`, `recolorTag`, `mergeTags`, `deleteTag`).
- [X] T052 [US4] `src/components/tags/TagPicker.tsx`, `TagChips.tsx` in the panel, cards and a `tags` sheet column; tag filters and group-by.
- [X] T053 [US4] `src/components/settings/TagsSettings.tsx` (admins).
- [X] T054 [US4] Task type default tags (T019) now applied.
- [X] T055 [US4] Strings `priority.*`, `tags.*`.

---

## Phase 8: User Story 5 — Several assignees with a lead (P2, Stage B)

**Independent test**: quickstart Stage B step 10.

### Tests for US5
- [X] T056 [P] [US5] Pure check `pure-assignees` (lead invariant; even split; per-person hours).
- [X] T057 [P] [US5] Real-app scenarios in `scenarios-023-b.cjs`: Samaa (lead) and Noran both see the task in My tasks and are notified; Shows in follows Samaa only; making Noran lead removes Samaa's assignee-only Space; any assignee may move a working stage; workload 6/2 after setting hours.

### Implementation for US5
- [X] T058 [US5] `setAssignees` in `src/actions/tasks.ts`: order, lead kept in `tasks.assignee_id`, notifications to new assignees, `changeAssigneeSpaces` on a lead change.
- [X] T059 [US5] `allowedStages`/`holdsStage` in `src/lib/stage-moves.ts`: any assignee holds working stages; My tasks and "Mine" include any assignee (`src/components/me/MyTasks.tsx`, board filters, Inbox).
- [X] T060 [US5] `src/components/people/AssigneesPicker.tsx` in the panel and sheets (lead marked; hours per person); avatars on cards.
- [X] T061 [US5] Workload split in `src/lib/workload.ts`.
- [X] T062 [US5] Strings `assignees.*`.

**Checkpoint — Stage B stop**: full regression; commit; previews; wait for the user's go.

---

## Phase 9: User Story 6 — Start dates (P2, Stage C)

**Independent test**: quickstart Stage C step 11.

- [X] T063 (built without a separate design page; screenshots at the Stage C stop) [US6] Design `design/023-stage-c.html` (start date in panel and sheet; calendar spans); publish; record approval. **Gate.**
- [X] T064 [US6] Schema `tasks.start_date`; types; mapper; `db push`.
- [X] T065 [P] [US6] Pure check `pure-start-dates` (start ≤ due; workload spread over working days on the Settings weekend).
- [X] T066 [P] [US6] Real-app scenarios `scenarios-023-c.cjs`: start Sun, due Thu, 10 h → five-day span, 2 h a day; a start after due is refused.
- [X] T067 [US6] `updateTask` start_date with `start_after_due`; panel row and sheet column `start`.
- [X] T068 [US6] Calendar "Spans" toggle (per device) in `CalendarView.tsx`.
- [X] T069 [US6] Workload spread: `dayLoad` in `src/lib/task-load.ts` (the Space Workload view; `src/lib/workload.ts` is the projects plan) and a week strip in `WorkloadView.tsx`.
- [X] T070 [US6] Strings `dates.start*`.

**Checkpoint — Stage C stop**: full regression; commit; wait for the user's go.

---

## Phase 10: User Story 7 — Templates (P3, Stage D)

**Independent test**: quickstart Stage D step 12.

- [ ] T071 [US7] Design `design/023-stage-d.html` (Settings › Templates, New from template, Save as template, repeat editor, ↻ marks); publish; record approval. **Gate for Stage D screens.**
- [ ] T072 [US7] Schema `TaskTemplate`; types; mapper; `db push`.
- [ ] T073 [P] [US7] Pure `src/lib/templates.ts` and check `pure-templates` (name pattern placeholders; relative dates; missing role → creator).
- [ ] T074 [P] [US7] Real-app scenarios `scenarios-023-d.cjs`: save a task as a template with two subtasks; create from it for 30 Dec; names, fields, people, dates right; editing the template leaves the task alone.
- [ ] T075 [US7] `src/actions/templates.ts` (`saveTemplate`, `deleteTemplate`, `templateFromTask`, `createFromTemplate` through `createTask`).
- [ ] T076 [US7] `src/components/settings/TemplatesSettings.tsx`; "Save as template" in the panel menu.
- [ ] T077 [US7] `src/components/templates/NewFromTemplate.tsx` in "+ Task", sheet new row and calendar day; task type default template (T019) applied.
- [ ] T078 [US7] Strings `templates.*`.

---

## Phase 11: User Story 8 — Recurring tasks (P3, Stage D)

**Independent test**: quickstart Stage D step 13.

- [ ] T079 [US8] Schema `RepeatRule`, `tasks.recurrence_key` (unique); types; mapper; `db push`.
- [ ] T080 [P] [US8] Pure `src/lib/recurrence.ts` and check `pure-recurrence` (next occurrence for days, weeks with weekdays, monthly incl. short months; minimum lead = type's total SLA working days; creation day = due − lead working days; ends on date or count; skip next).
- [ ] T081 [P] [US8] Real-app scenarios `scenarios-023-d.cjs`: weekly Sunday repeat; the next occurrence is created on its creation day with copied fields, once; a missed run creates it once; Skip next; a short lead is refused naming the minimum; the standing project's count includes occurrences.
- [ ] T082 [US8] `src/actions/recurrence.ts` (`setRepeat`, `skipNext`, `stopRepeat`).
- [ ] T083 [US8] Scheduler job `runRecurring(now)` in `src/lib/notify/scheduler.ts` (hourly), creating through `createFromTemplate` / a copy of the source task; `recurrence_key` makes each occurrence once.
- [ ] T084 [US8] `src/components/templates/RepeatEditor.tsx` in the panel and templates; ↻ on cards and rows; Skip next and Stop repeating.
- [ ] T085 [US8] Strings `repeat.*`.

**Checkpoint — Stage D stop**: full regression; commit; wait for the user's go.

---

## Phase 12: Polish

- [ ] T086 [P] Update the ClickUp parity map in `specs/021-clickup-parity/spec.md` (task types, custom fields, priorities, tags, start dates, templates, recurring: Built).
- [ ] T087 [P] HANDOVER: a "Task types and fields (spec 023)" section — tables, rules, where each lives, `once()` markers; Arabic strings added to §14 for native review.
- [ ] T088 Write `specs/023-task-types-fields/validation.md` with each quickstart step's result.
- [ ] T089 Full regression across specs 021–023 (typecheck, `lab:spaces`, `lab:sheet`, `lab:spreadsheet`, `lab:inbox`, `lab:notify`, `lab:hours`, every real-app scenario, `axe-022.cjs` extended to the new screens), and SC-006 timing on 5,000 tasks on a production build.

---

## Dependencies & Execution Order

### Phase dependencies
- **Phase 1** first; T001 (spec 022 shipped) gates everything; T004 gates Stage A screens.
- **Phase 2** blocks US1–US3.
- **US1 → US2**: field attachments are per type; **US3** depends only on Phase 2.
- **Stage stops** between A, B, C and D: each stage starts only after the user's go.
- **Stage B** (Phases 6–8): T041 gates its screens; US4 and US5 are independent of each other.
- **Stage C** (Phase 9) depends on Stage B's assignees for the workload split (T061).
- **Stage D**: US7 before US8 (recurring creation uses templates).

### Within each story
Tests first (they fail), then model, rules, actions, screens, strings.

### Parallel opportunities
- T006, T007, T010, T011, T012 (different files).
- Each story's pure check and real-app scenario file ([P]).
- US4 and US5 in Stage B once T040–T045 are done.
- T086, T087 in Polish.

## Parallel Example: User Story 2

```text
T021 pure-task-fields   ||   T022 scenarios-023-a.cjs (fields)
then T023 actions → T024 move gate → T026–T031 screens (sequential: shared components)
```

## Implementation Strategy

- **MVP = Stage A** (US1–US3): task types, fields by type with Required from stage, status groups, milestones. Stop and review.
- Then Stage B (priorities, tags, assignees), Stage C (start dates), Stage D (templates, recurring), each ending with a review stop, regression, commit and previews.
- Pushes only when the user says "push"; never merge or open a PR.
