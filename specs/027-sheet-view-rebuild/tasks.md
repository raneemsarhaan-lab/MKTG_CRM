# Tasks: Sheet view rebuild

**Input**: Design documents from `/specs/027-sheet-view-rebuild/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md

**Tests**: Requested — Playwright real-app scenarios per user story (`scripts/spaces-lab/realapp/scenarios-027-*.cjs`, registered in `run.cjs`) and a pure lab for `src/lib/tab-link.ts`.

**Organization**: by user story; stages A–D of plan.md map to: A = US1, B = US2 + US3, C = US4, D = US5 + US6.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 (done: views, board-tab and tabs scenarios registered; structure and convert come with their stages) Register a `scenarios-027-views.cjs`, `scenarios-027-board-tab.cjs`, `scenarios-027-tabs.cjs`, `scenarios-027-structure.cjs` and `scenarios-027-convert.cjs` placeholder (each exporting `[]`) in scripts/spaces-lab/realapp/run.cjs
- [X] T002 (done: messages under sheets.linkTab, sheets.rowsTab, sheets.tabMenu, content.rows, en and ar) [P] Add `spec027` message namespaces (en and ar) for every new string listed in contracts/server-actions.md errors and the UI below in messages/en.json and messages/ar.json

---

## Phase 2: Foundational (blocking)

- [X] T003 (done; `content_rows.project_id` is also optional now, for a tab's rows under no theme — DROP NOT NULL, allowed by the guard) Extend prisma/schema.prisma per data-model.md: `Sheet.linked Boolean @default(false)`, `Sheet.space_id String? @db.Uuid`, `ContentRow.sheet_id String? @db.Uuid`, `ContentRow.last_task_id String? @db.Uuid`, `@@unique([sheet_id, task_id])` on content_rows, `ContentSheetTheme.sheet_id String? @db.Uuid` with `@@unique([sheet_id, project_id])`; run scripts/schema-guard.sh and `prisma db push` locally
- [X] T004 (done: board data splits Board-tab themes and rows from added tabs' `tabThemes` / `tabRows`; the Board tab's sync filters `sheet_id` null) Keep the Board tab's loaders to rows and themes with `sheet_id` null (src/lib/board-data.ts), so existing Board-tab behaviour is unchanged
- [X] T005 [P] Pure link rules in src/lib/tab-link.ts: `matchColumns(columns, fields)` (by normalised name; unknown → 'sheet'), `linkPreview(rows, matches)` → `{ create, reconnect, untitled, conflicts }`, `rowValuesToTask(row, matches)`; and a lab scripts/spaces-lab/tab-link.lab.ts covering: titled/untitled rows, rows with last_task_id (reconnect), rows already linked (skip), brand by name, unknown column → sheet only, idempotency (second preview after link = create 0)
- [X] T006 (done inside src/actions/sheet-tabs.ts `tabFor` and src/actions/sheets.ts `mayManageTab`, with the existing src/lib/sheet-access.ts) [P] Tab permission helper `mayManageTab(sheet, member)` and `mayUseNode(node, member)` in src/lib/sheet-access.ts (creator, admin, superuser; Board tab never)

**Checkpoint**: schema in place, link rules tested, existing suite green.

---

## Phase 3: User Story 1 — Open the right view straight away (P1) 🎯 MVP · Stage A

**Goal**: Board · Sheet · Calendar · List · + View tabs open directly; the Board's Cards/List toggle never opens the sheet; view tab menu complete.

**Independent Test**: quickstart.md › A.

### Tests

- [X] T007 [P] [US1] Scenarios in scripts/spaces-lab/realapp/scenarios-027-views.cjs: Sheet opens on click, on refresh and from its link (no `[data-node-workbook-loading]` after 10 s); Board Cards/List toggle shows `[data-list-view]`/cards and never `[data-workbook]`; + View of type List; tab menu Rename, Duplicate, Delete on a saved view; no Delete on Board/Sheet/Calendar; reopening the Space lands on the last view

### Implementation

- [X] T008 [P] [US1] Rename and duplicate saved views (done with the existing `saveView` — with its id it renames, without it copies — and `deleteView`; same owner/lead rules) in src/actions/views.ts
- [X] T009 [US1] View tab "…" menu in src/components/views/ViewHost.tsx: Rename (inline edit), Duplicate, Set as default (existing home), Delete (saved views only, confirm), Pin, Hide; `data-tab-action` hooks for tests
- [X] T010 [US1] Board layout toggle in src/components/kanban/KanbanBoard.tsx: two options, Cards and List (compact list of the same board, grouped by stage); remove the toggle's sheet option and its `?view=` writes when embedded in a Space page
- [X] T011 [US1] Offer List in "+ View" on Space and folder pages (src/components/views/SpacePage.tsx, already rendering ListView) and on Brand pages (src/components/views/BrandPage.tsx)
- [X] T012 [US1] Verify last-view memory per Space and per folder node (`space:<id>` vs `space:<id>:brand:<id>`) in src/components/views/ViewHost.tsx; fix if a folder inherits the Space's last view

**Checkpoint**: US1 scenarios and the full suite green → commit, push.

---

## Phase 4: User Story 2 — The Board tab mirrors the board (P1) · Stage B

**Goal**: Sheet view opens on a fixed, always-linked Board tab listing every board task (Theme › Pillar, No theme last) under the Board's own filter.

**Independent Test**: quickstart.md › B (first two checks).

### Tests

- [X] T013 [P] [US2] Scenarios in scripts/spaces-lab/realapp/scenarios-027-board-tab.cjs: "Mine" on Board → same task ids in the Board tab; stage move on the board → Status in the tab, and Status changed in the tab → card column on the board; a task with no theme in "No theme" last; Board tab menu says always linked, no Delete/Unlink/Move; Content › Forefront Board tab holds only Forefront tasks

### Implementation

- [X] T014 (done: the workbook's linked tab is first and named "Board" on Space and brand pages) [US2] Board tab record: ensure each Space's workbook has a Board tab first (`linked_content`/`linked_video` for Content/Video; `kind 'board'` for other Spaces) in src/actions/sheets.ts `ensureNodeWorkbook`, position 0, named from translations
- [X] T015 [US2] Rows sheet shows every board task: in src/components/content/rows.ts (buildContentRows) add tasks on the board without a row under their theme/pillar, and a trailing "No theme" group; Space › Brand folder narrows to its brand; Brand page shows the brand's tasks from every Space
- [X] T016 (done with per-page browser storage, `momentum.scope.<page>` / `momentum.filters.<page>`, per research R5) [US2] Shared Board filter: store Mine/Everyone, filters and sort per person per page in tab prefs (src/lib/view-config.ts `TabPrefs.board`, src/actions/views.ts `setTabPrefs`) and read them in both src/components/kanban/KanbanBoard.tsx and the Board tab (src/components/content/ContentSheet.tsx); show the same filter bar above the Board tab
- [X] T017 [US2] Tab bar rules in src/components/sheets/TabBar.tsx and src/components/sheets/Workbook.tsx: the Board tab is first, not draggable, not renamable, not deletable; its menu shows "The Board tab is always linked"
- [X] T018 [US2] Removing a row in the Board tab offers only "Archive the task" (src/components/content/ContentSheet.tsx row menu)

**Checkpoint**: US2 scenarios and the full suite green → commit, push.

---

## Phase 5: User Story 3 — Linked and unlinked tabs (P2) · Stage B

**Goal**: "+" adds unlinked tabs; link/unlink/relink with previews and no duplicates; Make task, Unlink row, Add existing task; removal choices; permissions.

**Independent Test**: quickstart.md › B (remaining checks).

### Tests

- [X] T019 [P] [US3] Scenarios in scripts/spaces-lab/realapp/scenarios-027-tabs.cjs: + adds an unlinked tab, Board tab unchanged; link a tab with 3 titled + 1 untitled row → preview "create 3", 3 tasks in To Do, 1 plain row listed; + Row in the linked tab creates a task; unlink → tasks stay, rows keep values; link again → "Reconnects 3", 0 created; Make task on one row of an unlinked tab → 1 task; linking that tab later creates only the others; Add existing task puts the same task in two tabs; remove-from-tab keeps the task, Archive archives it; Content › Forefront linked tab and Make task → Brand Forefront; a user (not creator) can't link/unlink/delete someone else's tab (server refuses)

### Implementation

- [X] T020 [US3] src/actions/sheet-tabs.ts: `addTab`, `renameTab`, `duplicateTab`, `deleteTab` (tab + plain rows only), `linkPreview`, `linkTab` (idempotent; reconnects `last_task_id`; creates tasks in the first stage with folder brand), `unlinkTab` (rows keep last task values, `last_task_id` set) — per contracts, using src/lib/tab-link.ts and src/lib/sheet-access.ts
- [X] T021 [US3] Row actions in src/actions/content-rows.ts for rows with `sheet_id`: `makeTask` (reconnect if `last_task_id`), `unlinkRow`, `addExistingTasks`, `removeRow(mode)`; titled new rows in a linked tab create tasks
- [X] T022 [US3] Load added tabs' rows (`sheet_id`) and groups in src/lib/board-data.ts / sheet loaders, and render a `kind 'rows'` tab with the rows grid (src/components/content/ContentSheet.tsx in tab mode: no Board filter; Make task, Unlink row, Add existing task in its menus)
- [X] T023 [US3] Tab menu in src/components/sheets/TabBar.tsx: Link to board / Unlink from board, Rename, Duplicate, Delete (confirm); link icon on linked tab names; "+" calls `addTab`
- [X] T024 [US3] Link dialog src/components/sheets/LinkTabDialog.tsx: each column → field select (or Sheet only), counts "This will create N tasks on the [Space] board" / "Reconnects N rows", untitled rows listed; Brand page asks the Space
- [X] T025 (done: a linked row's Title is its task's name with the board's Status and Link task cells) [US3] Linked row Task cell: task name as a link with Space and stage (reuse the Link task cell) in src/components/content/ContentGrid.tsx

**Checkpoint**: US3 scenarios and the full suite green → commit, push.

---

## Phase 6: User Story 4 — Themes, pillars and child rows (P2) · Stage C

**Goal**: Group structure in every tab; linked rows follow their groups; child rows; drag; safe deletes.

**Independent Test**: quickstart.md › C.

### Tests

- [X] T026 [P] [US4] Scenarios in scripts/spaces-lab/realapp/scenarios-027-structure.cjs: + Theme from an existing project shows owner/frequency/audience tooltip; + Pillar adds to the project; Enter on + Row adds the next row; Tab makes a child (subtask when linked), Shift+Tab moves it out; drag a linked row to another pillar changes the task's pillar; drop on a row nests it; deleting a pillar asks where rows go and deletes none; deleting a parent asks about children; labels in an unlinked tab map to projects on linking

### Implementation

- [X] T027 [US4] Themes on added tabs: place/reorder/remove a project on a tab (`content_themes.sheet_id`) in src/actions/content-rows.ts theme actions, reorder per sheet only
- [X] T028 (kept as the owner decided on 24 Nov 2026: + Theme asks for a name only; an existing project with that name in the brand is reused) [US4] + Theme / Insert theme above/below with existing project or New project (name, owner, frequency, audience) in src/components/content/ContentSheet.tsx (admins, superusers; server check)
- [X] T029 (the tooltip already existed on the Board tab; pseudo groups such as "No theme" have none) [US4] + Pillar in a theme's menu (admins, superusers, theme owner) and theme tooltip (owner, frequency, audience) in src/components/content/ContentGrid.tsx
- [X] T030 (Paste plan on an added tab adds its lines as the tab's rows — tasks when linked — via `pasteTabRows`) [US4] "+ Row" line at the end of each theme and pillar with Enter for the next row; Insert row above/below; Paste plan on a theme, pillar or + Row line (≤200 lines; linked tab → tasks) in src/components/content/ContentSheet.tsx and src/actions/content-rows.ts
- [X] T031 (a new child row under a task in a linked tab is a subtask; Tab on an existing task row nests the row only, it doesn't turn the task into a subtask) [US4] Child rows: Add child row, Tab / Shift+Tab (one level), subtask link for linked parents in src/actions/content-rows.ts `setRowParent` and the grid key handling
- [X] T032 [US4] Drag a row onto a group (move; linked → task theme/pillar) or onto a row (nest) in src/components/content/ContentGrid.tsx and `moveRow`
- [X] T033 (in an added tab a removed theme's rows may also go to "No theme") [US4] Delete a theme or pillar: dialog choosing where rows go (never deleted; project stays); delete a parent row: move children up or delete with it

**Checkpoint**: US4 scenarios and the full suite green → commit, push.

---

## Phase 7: User Story 5 — Columns per tab and person (P3) · Stage D

**Goal**: Each tab keeps per-person columns, order, widths, sort, grouping, collapsed groups.

**Independent Test**: quickstart.md › D (first check).

- [X] T034 [P] [US5] Scenario in scripts/spaces-lab/realapp/scenarios-027-structure.cjs (or -convert): two people's layouts in one added tab stay separate; "+" opens the Add column panel in an added tab
- [X] T035 (the tab's columns key is `rows:tab:<sheetId>` in members.sheet_layouts; sort and grouping stay the sheet's shared view as on the Board tab) [US5] Per-tab layout keys (`tab:<sheetId>`) with sort, group and collapsed groups in `members.sheet_layouts` via src/actions/fields.ts `setMyColumns` and src/components/sheet/useSheetColumns.tsx

---

## Phase 8: User Story 6 — Convert the existing sheets without loss (P1 for release) · Stage D

**Goal**: Content/Video sheets become Board tabs; old Sheets-section tabs move to their Spaces; report first; nothing deleted.

**Independent Test**: quickstart.md › D (conversion).

- [X] T036 (run on the copy of 24 Nov: nothing to move) [P] [US6] Read-only report scripts/release/sheet-convert-report.sh: every old tab → destination (Board tab, Space workbook, unmatched), with rows/cells/formats/comments, and before totals
- [ ] T037 [US6] Conversion step in src/lib/sheet-convert.ts as a `once()` seed step: mark Content/Video linked sheets as their Spaces' Board tabs; move matched team-folder tabs to the Space workbooks (folder change only); leave unmatched tabs where they are and list them
- [ ] T038 [US6] Dry run on a copy restored from a fresh live backup (ask the owner for it): run the report, apply on the copy, compare before/after counts, write the report for approval in the scratchpad (never committed)
- [ ] T039 [US6] Scenario in scripts/spaces-lab/realapp/scenarios-027-convert.cjs: after the step, the Content Space's Board tab shows the former Content sheet's rows, custom columns, values and comments; counts unchanged

---

## Phase 9: Polish & cross-cutting

- [ ] T040 [P] Arabic review of every new string and RTL layout of the tab menu, link dialog and group menus (screenshots EN/AR/phone)
- [ ] T041 [P] Update specs/027-sheet-view-rebuild/quickstart.md with any changed steps and write specs/027-sheet-view-rebuild/validation.md (what was checked, results)
- [ ] T042 Full suite green, `tsc --noEmit` clean, production build passes; commit and push to the branch

---

## Dependencies & Execution Order

- Setup (T001–T002) → Foundational (T003–T006) → stories.
- US1 (Stage A) needs only Setup; it can ship before the schema change.
- US2 needs T003–T004 (rows loader), and T014 before T015–T018.
- US3 needs US2 (Board tab) and T005–T006.
- US4 needs US3's added tabs (groups live in tabs).
- US5 can follow US3.
- US6 (conversion) runs last, after US2–US4 are tested on staging, and needs a fresh backup.

## Parallel Opportunities

- T002, T005, T006 alongside T003.
- Each story's scenario file ([P]) alongside its first implementation task.
- T008 alongside T009–T011 (different files).
- T036 (report script) any time after T003.

## Implementation Strategy

1. **MVP = US1** (views open directly; Cards/List; tab menu). Push to staging.
2. **US2** (Board tab mirrors the board), push.
3. **US3** (linked/unlinked tabs), push.
4. **US4** (structure), push.
5. **US5 + US6** (columns per tab; conversion with dry run and the owner's approval).
