---
description: "Task list for Content Library Sheet"
---

# Tasks: Content Library Sheet

**Input**: Design documents from `specs/009-content-library-sheet/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Revised after /speckit-analyze (2026-11-04)**: SC-006 is now tested (T030); a Task Link to a task in another theme has an explicit Move here tick (T017, T016); the published link on pieces goes through `updatePiece`, not the clip-only `updateClip` (T021); "assigned to a theme" is defined once, in research R7.

**Tests**: As in spec 008, each story ends with a validation task that adds lab scenarios. Spec 008's whole lab is the regression gate for the shared grid core.

**Conventions**

| Term | Meaning |
|---|---|
| Content dir | `src/components/content/` |
| Grid core | `src/components/sheet/GridCore.tsx` |
| Actions | `src/actions/content.ts` (new); drop changes in `src/actions/tasks.ts` |
| Board | `src/components/kanban/KanbanBoard.tsx` |
| Lab | `scripts/sheet-lab/`, `npm run lab:sheet` (content mode: `#view=content`) |
| Strings | `useTranslations('content')`, English and Arabic in the same task |
| Colours | `SHEET_UI` and `--sheet-*` only |

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 Create `design/content-sheet.html`, extending `design/video-sheet.html`:
  - theme rows (owner, frequency with "this week n of m", audience) and pillar rows;
  - piece columns, with the four link cells (including "Not a link" and "Missing link");
  - content status names;
  - a video piece expanded into clips;
  - Paste plan: themes and pillars, New / Matched / Already in the sheet / Problems, and "Use the sheet's title and status";
  - the theme editor popover.

  Publish it as an artifact, then commit it.
- [ ] T002 [P] Lab fixtures for the content mode in `scripts/sheet-lab/content-fixtures.ts`:
  - the 18 "Plan (Organized)" rows from the reference, as Google Sheets HTML with `rowspan` merged cells, and as TSV;
  - existing tasks for the 7 Task Links;
  - two themes, two pillars and a video piece with clips;
  - members including Samaa (Content Creator, `user`) and Noran (Content Creator, `user`).

---

## Phase 2: Foundational (blocks every story)

- [ ] T003 In `prisma/schema.prisma`:
  - `Project`: `is_theme`, `owner_id` (relation `ThemeOwner` to `Member`, SetNull), `frequency_count`, `frequency_period`, `audience String[] @default([])`, `pillars`;
  - new `ContentPillar` model (data-model §1);
  - `Task`: `pillar_id` (SetNull), `post_url`;
  - `TaskAttachment`: `link_role`.

  Run `npx prisma generate` and `bash scripts/migrate.sh`.
- [ ] T004 [P] In `prisma/seed.ts`, add Article, Report and Framework/Model to the content types, with SLA rows copied from Post's defaults (create-only).
- [ ] T005 [P] In `src/types/index.ts`:
  - `BoardView` gains `'content'`;
  - add `FrequencyPeriod`, `AudienceKey`, `LinkRole`, `ContentTheme`;
  - `Task.pillar_id` and `Task.post_url`; `TaskAttachment.link_role`.

  In `src/lib/mappers.ts`, map them and add `mapTheme`.
- [ ] T006 [P] Add a `content` namespace to `messages/en.json` and `messages/ar.json`:
  - `content.stage.*` (FR-020);
  - toolbar, column headers, theme row (owner, "{n} per week", "this week {done} of {target}"), audience labels;
  - pillar and theme menus and the theme editor;
  - the Paste plan preview and every problem;
  - link cells ("Not a link", "Missing link");
  - archive and restore, summary, errors.
- [ ] T007 [P] Pure modules in the Content dir:
  - `audience.ts`: `AUDIENCES` and `readAudience`;
  - `parse-plan.ts`: `gridFromHtml` (rowspan and colspan), `gridFromText`, `readPlan`, `readStatus`, `readType`, `readFrequency`, `taskIdFromLink`, `isWebLink` (research R8);
  - `rows.ts`, `summary.ts`, `cadence.ts` (data-model §4).
- [ ] T008 Extract the grid core from `src/components/sheet/SheetGrid.tsx` into `src/components/sheet/GridCore.tsx` (research R10):
  - a model interface for cells, text values, menus, rendering, `colsOf` (spanning rows), commit, open, toggle, delete, paste and notes;
  - rewrite `SheetGrid` as a model over it.

  Check: the spec 008 lab passes unchanged (68/68).
- [ ] T009 Widen drop and restore in `src/actions/tasks.ts`:
  - `dropTask` and `restoreTask` allow a clip of a video **or** a piece of a theme project;
  - `dropClip` and `restoreClip` remain as aliases.
- [ ] T010 In `src/app/(app)/board/page.tsx`:
  - load theme projects (`is_theme`) with owner, frequency, audience and pillars;
  - add `pillar_id`, `post_url` and attachment `link_role` to the task query;
  - pass `themes` to `KanbanBoard`.
- [ ] T011 Lab Node checks in `scripts/sheet-lab/pure.mjs`:
  - `content-parse-html` (the reference HTML with merged cells: 18 pieces, carried-down themes, owners and pillars);
  - `content-parse-tsv`;
  - `content-readers` (status, type, frequency, audience, Task Link, links);
  - `content-cadence`, `content-summary`;
  - tokens-only for the Content dir;
  - messages parity for `content`.

**Checkpoint**: schema applied, types and strings in place, the grid core shared with no video-sheet regression.

---

## Phase 3: User Story 1 — See the whole content plan in one sheet (P1) 🎯 MVP

- [ ] T012 [US1] Create `src/components/content/ContentGrid.tsx`, a model over the grid core:
  - theme and pillar rows as spanning cells;
  - piece cells per contracts/content-ui.md (read-only at this stage: title, type, status with content names, owner, assignee, pillar, the four links, date, archive);
  - `treegrid` levels.
- [ ] T013 [US1] Create `src/components/content/ContentSheet.tsx`:
  - toolbar: Board · Sheet · Content, Mine, Show archived (stored as `momentum.content.archived`);
  - summary line;
  - collapse per theme;
  - empty state ("No themes yet": admins see + Theme).
- [ ] T014 [US1] In Board, add `'content'` to the view switch (both toolbars) and `?view=content`, and render `ContentSheet` from the same `tasks` state, with a `themes` prop.
- [ ] T015 [US1] Lab scenarios `cus1-1`…`cus1-5` in `scripts/sheet-lab/scenarios/content-us1.mjs`, plus `#view=content` support in `entry.tsx`.

---

## Phase 4: User Story 2 — Bring the Google Sheet in (P1)

- [ ] T016 [US2] `addPlan` in `src/actions/content.ts`, per contracts/server.md: advisory lock; theme, pillar and piece matching; problems; never storing a non-link.
- [ ] T017 [US2] `src/components/content/PlanPreview.tsx`:
  - paste box;
  - themes and pillars to create or match;
  - New / Matched by Task Link / Already in the sheet / Problems (fix the title, status or link in place, or leave out);
  - a matched task in another theme is flagged "In {theme}", with a per-row **Move here** tick, off by default. Unticked, the row is left out (spec edge case);
  - "Use the sheet's title and status";
  - Add, with a result message.

  Wire `api.addPlan` in Board (optimistic, then refresh).
- [ ] T018 [US2] Lab scenarios `cus2-1`…`cus2-6`, including pasting the same rows twice.

---

## Phase 5: User Story 3 — Status in content words (P1)

- [ ] T019 [US3] Let `StatusContent` and `statusMenuItems` take the stage-name namespace (`sheet` or `content`). The Content grid uses content names. Moves go through `api.move`, and moving to Published asks for the published link (and the post link for Post pieces).
- [ ] T020 [US3] Lab scenarios `cus3-1`…`cus3-4` (the menu equals `allowedStages` for several members).

---

## Phase 6: User Story 4 — Every link in one row, checked (P2)

- [ ] T021 [US4] `setPieceLink` and `updatePiece` (`post_url`, `published_url`) in Actions. The link cells open the shared `LinkPrompt`. A non-link is refused with a note. Show the site's name. Wire `api.setPieceLink` and `api.updatePiece` in Board.
- [ ] T022 [US4] Lab scenarios `cus4-1`…`cus4-4`.

---

## Phase 7: User Story 5 — Themes keep their cadence (P2)

- [ ] T023 [US5] `saveTheme`, `addTheme`, `savePillar`, `removePillar` in Actions.
- [ ] T024 [US5] `src/components/content/ThemeEditor.tsx`: owner, frequency (count and period), audience checkboxes, pillars.
  - Theme row menu: Edit theme, Add pillar, + Piece, Collapse.
  - Pillar row menu: Rename, Remove.
  - Cadence on the theme row. Wire the host calls in Board.
- [ ] T025 [US5] Lab scenarios `cus5-1`…`cus5-3`.

---

## Phase 8: User Story 6 — Videos and their clips inside the plan (P2)

- [ ] T026 [US6] In `ContentGrid` and `rows.ts`, a Video piece with clips gets a caret and expands into clip rows (title, type, status with video names, owner, assignee). The row menu offers "Open in video sheet" (switches to `?view=sheet&video=`). Clips are not counted as pieces.
- [ ] T027 [US6] Lab scenarios `cus6-1`…`cus6-3`.

---

## Phase 9: User Story 7 — Add and edit pieces inline (P3)

- [ ] T028 [US7] `addPiece` in Actions (`mayAddPiece`). In the grid:
  - **+ Piece** draft rows;
  - inline title (`updateTask`), type and assignee menus, pillar menu (`updatePiece`), due date (`YYYY-MM-DD` or `DD/MM/YYYY`);
  - Archive / Restore via `dropTask` / `restoreTask`;
  - + Piece hidden where the member may not add.
- [ ] T029 [US7] Lab scenarios `cus7-1`…`cus7-3`, including a `user` who may add only to their own theme.

---

## Phase 10: Polish

- [ ] T030 [P] Lab scenarios `content-kbd`, `content-rtl`, `content-phone`, `content-axe`, and `content-rows` (at least 20 rows visible at 1366×657, SC-006).
- [ ] T031 Run `npm run typecheck`, `bash scripts/preflight.sh`, `next build`, `npm run lab:sheet` (both sheets), `lab:attachments` and `lab:brief`.
- [ ] T032 Running-app checks (quickstart §2) with the 18 reference rows in local PostgreSQL. Record the results in `specs/009-content-library-sheet/validation.md`.
- [ ] T033 [P] Write `specs/009-content-library-sheet/constitution-check.md` (the §III sign-off for adding pieces), and add a "Content sheet" section to `HANDOVER.md`.

---

## Dependencies

- **Setup** (T001, T002) → **Foundational** (T003–T011) → **US1** → US2–US7.
  - T008 must pass spec 008's lab before any content UI.
  - T001 blocks UI tasks.
- **US2, US3, US4, US5, US6** depend on US1 only.
- **US7** uses US5's theme editor for pillar choices.
- **Polish** last.

**Parallel**: T004–T007 together; T016 alongside T019 and T021; T023 alongside T026.

## Implementation strategy

1. **MVP**: US1, a read-only Content sheet from the existing data.
2. **US2 + US3**: the import and status moves make it replace the Google Sheet.
3. **US4–US7**: links, cadence, videos and inline adds.
