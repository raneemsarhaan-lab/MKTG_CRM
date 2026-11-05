---
description: "Task list for A Calmer Board Header"
---

# Tasks: A Calmer Board Header

**Input**: Design documents from `specs/011-board-header/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/header-ui.md](./contracts/header-ui.md), [quickstart.md](./quickstart.md)

**Tests**: Each story ends with lab scenarios, as in specs 006–010. A new header lab (`npm run lab:header`) covers the header. The sheet and inbox labs are the regression gate for the views it now sits above.

**Conventions**

| Term | Meaning |
|---|---|
| Board | `src/components/kanban/KanbanBoard.tsx` |
| Header | `src/components/board/BoardHeader.tsx` (top bar and title row) |
| Toolbar | `src/components/board/BoardToolbar.tsx` (row 3 on Pipeline · Board) |
| Filters | `src/components/kanban/BoardFilters.tsx` |
| CSS | the new `/* ─── board header (spec 011)` block in `src/app/globals.css` |
| Strings | `useTranslations('header')` → `header.*`, English and Arabic in the same task |
| Lab | `scripts/header-lab/`, `npm run lab:header` |
| Design | `design/board-header.html` (published) |
| Colours | `PIPE`, `INBOX_UI` and existing CSS variables only |

**Scope**:
- **Unchanged:** the pipeline columns, the cards, the sidebar, the phone tab bar, the sheet grids, the Inbox panel and the task form.
- **Added behaviour:** search filtering on the sheets (R6) is the only one.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 The design file `design/board-header.html`: a clickable preview with desktop and phone, English and Arabic, the Inbox states and the member switch. Published and committed.
- [ ] T002 [P] Lab skeleton in `scripts/header-lab/`, copied from the shape of `scripts/inbox-lab/`:
  - `build.sh`: an esbuild bundle aliased to `@` → `src`, plus `index.html` and axe;
  - `entry.tsx`: next-intl provider; `#locale=ar`, `#me=user`, `#inbox=urgent|normal|clear`, `#view=board|sheet|content`, `#brands=12`;
  - `fixtures.ts`: four real brands (Forefront Consulting, Islam Personal Branding, Omnisight, The Strategy Community), with an option for 12; members (an admin and a Content Creator); Inbox counts;
  - `scenarios.mjs`: the runner, `pass/fail`, `t.eq`, `t.assert`, `t.axe`, and a `MISSING_MESSAGE` trap.

  Add `"lab:header": "bash scripts/header-lab/build.sh && node scripts/header-lab/scenarios.mjs"` to `package.json`.

---

## Phase 2: Foundational (blocks every story)

- [ ] T003 [P] In `src/types/index.ts`, add `export type BoardTab = 'pipeline' | 'content'` beside `BoardView`.
- [ ] T004 [P] The `header.*` strings in `messages/en.json` and `messages/ar.json` (research R8):

  | Key | English | Arabic |
  |---|---|---|
  | `pipeline` | Pipeline | خط الإنتاج |
  | `content` | Content | المحتوى |
  | `tabsLabel` | Pages | |
  | `search` | Search tasks, campaigns, assets… | |
  | `searchOpen` | Search | |
  | `searchClose` | Close search | |
  | `mine` | My tasks | مهامي |
  | `team` | Team tasks | مهام الفريق |
  | `scopeLabel` | Whose tasks | |
  | `allBrands` | All brands | جميع البراندات |
  | `nBrands` | {n} brands | |
  | `brandsLabel` | Brands | |
  | `filters` | Filters | |
  | `filtersN` | Filters · {n} | |
  | `display` | Display options | خيارات العرض |
  | `board` | Board | اللوح |
  | `sheet` | Sheet | الجدول |
  | `viewLabel` | View | |
  | `newTask` | New task | مهمة جديدة |
  | `noProject` | {n} no project assigned | |
  | `allAttached` | Every task has a project | |
  | `account` | {name}, {role} | |

  Empty Arabic cells are translated in the same task. Arabic plural forms are used where a key takes a number.
- [ ] T005 The page column in Board (R1):
  - **One layout for all three views.** Render `<div className="fx-board-page">` holding the header slot, then the view (board area, `<VideoSheet>` or `<ContentSheet>`), instead of returning early for `sheet` and `content`.
  - **Page height.** In CSS, `.fx-board-page` is a full-height flex column: `100dvh`, or `100dvh` minus the tab bar under 767 px.
  - **Sheet height.** `.fx-sheet` changes to `flex: 1; min-height: 0` inside it. Its own `100dvh` rules are removed, as is the phone rule at `globals.css:1214`.
  - **What stays.** The task panel and the Inbox panel still render as today.
- [ ] T006 [P] `ViewPair` in `src/components/board/ViewPair.tsx` (contract §1):
  - Board | Sheet, `role="group"`, `aria-pressed`;
  - grid and list icons with the `header.board` and `header.sheet` labels, which carry `title` and `aria-label` when CSS hides them;
  - `data-view-pair` and `data-view`.

**Checkpoint**: Board, Sheet and Content still render and switch exactly as before. Run `npm run lab:sheet` and `npm run typecheck`.

---

## Phase 3: User Story 1: a header that reads in three rows (P1) 🎯 MVP

**Goal**: The top bar, the title row and the toolbar, in the reference's order. The greeting, the tagline, PIPELINE and the dark Board label are gone, and every function still works.

**Independent Test**: At 1440 × 900 the rows match `reference.webp`. The first column starts at 280 px or less, and every FR-003 function works.

- [ ] T007 [US1] The header in `src/components/board/BoardHeader.tsx` (contract §1–§2):
  - **Top bar** (`data-top-bar`):
    - the tabs (`role="tablist"`, `data-tab`; ←/→ move between them);
    - search (`data-header-search`, `header.search`), bound to `filters.search`;
    - the Inbox slot;
    - a divider;
    - the avatar slot.
  - **Title row** (`data-title-row`):
    - `<h1 data-page-title>` with `header.pipeline` or `header.content` and `TitleTicks`;
    - `+ New task` (`data-new-task`), only when `canCreate`;
    - the row's height is fixed (R7).
- [ ] T008 [P] [US1] The purple tick accent in `src/components/board/TitleTicks.tsx`: an SVG copied from the design, `aria-hidden`, mirrored in RTL.
- [ ] T009 [US1] The toolbar in `src/components/board/BoardToolbar.tsx` (`data-toolbar`):
  - the scope pair (`data-scope`, `header.mine` and `header.team`, the same `onScope`);
  - a divider;
  - the brand slot;
  - the Filters slot;
  - the no-project note (`data-no-project`);
  - on the far end, `ViewPair`, a divider, and the Display options slot.
- [ ] T010 [US1] Filters:
  - Remove the top line (the scope group, the All brands pill, the logo row and the dark Board label) and the "no project" pill. Their logic moves to Board and the toolbar.
  - Export `FiltersButton`: today's `FieldPill` "Filter" popover, unchanged inside. Its trigger reads `header.filters` / `header.filtersN`, has `data-filters`, and uses the toolbar style.
  - Keep the `applyBoardFilters`, `EMPTY_FILTERS` and `activeFilterCount` exports.
- [ ] T011 [US1] In `src/components/inbox/ViewMenu.tsx`, change the trigger to `header.display` with the sliders icon, `data-display-options`, and the toolbar style. The items, their `data-view` attributes and their saving are unchanged.
- [ ] T012 [US1] Wire it up in Board:
  - **Remove:**
    - the greeting state and its effect;
    - the tagline;
    - the identity chip;
    - the old search and tools;
    - the PIPELINE heading;
    - the `ViewSwitch` component.
  - **Render `BoardHeader` with:**
    - `tab` derived from `view`;
    - `onTab`: Pipeline returns to the last pipeline view (R10);
    - the search;
    - the Inbox (the existing `InboxButton` and `inboxBtn` ref, `variant="compact"` once US3 lands);
    - the avatar (`UserMenu`, `variant="header"` once US3 lands; until then a plain initials circle with `data-account`);
    - `canCreate = currentUser.access !== 'user'`;
    - `onNewTask = () => setShowTaskForm(true)`.
  - **On Board, render `BoardToolbar`** with scope, brands (the slot holds the existing pill until US2), `FiltersButton`, `ViewMenu`, the no-project count (one brand only), and `ViewPair`.
  - **Keep in place:** `HeroCards` and the pinned split.
- [ ] T013 [US1] Desktop CSS for the three rows (contract §4):
  - the top bar at 70 px, with search centred up to 520 px;
  - tabs as pills on `#F0EBFE` and the purple when selected;
  - the title row at 92 px, with the title in `--font-heading` 800 38 px;
  - New task at 48 px on `PIPE.limeCta`;
  - the toolbar: pairs and outline buttons at 42 px, dividers in `PIPE.border`;
  - a 2.5 px purple focus ring.

  Remove the old `.fx-board-head`, `.fx-board-tools`, `.fx-board-search` and `.fx-board-ident` rules.
- [ ] T014 [US1] Lab scenarios `h1-*` in `scripts/header-lab/scenarios/us1.mjs`:
  - the row order;
  - no greeting, no PIPELINE, no dark Board label, no `data-view-switch`;
  - New task hidden for `#me=user`, with the title row's height unchanged;
  - each FR-003 control present and wired (the stub host records calls);
  - typing in search updates the host's query.

**Checkpoint**: the MVP. The header is in three rows on Board, and nothing is lost.

---

## Phase 4: User Story 2: brands in a dropdown (P1)

**Goal**: One **All brands ▾** button in place of the logo row.

**Independent Test**: Pick one brand: its name shows and the board narrows. Pick two: "2 brands". Choose All brands: the filter clears.

- [ ] T015 [US2] The brand dropdown in `src/components/board/BrandMenu.tsx` (R3):
  - built on `FieldPill`;
  - **trigger** (`data-brand-menu`): `header.allBrands`, or one brand's mark and name (ellipsis at 200 px, full name in `title`), or `header.nBrands`;
  - **list**: an "All brands" entry (`data-brand-option="all"`), a divider, then each brand (`data-brand-option="<id>"`) with its mark (move `BrandMark` from Filters into this file and export it), its name and a ✓;
  - **selection**: today's `toggleBrand` rule (empty means all; choosing every brand clears back to empty), moved from Filters;
  - **keyboard**: ↑↓, Enter or Space to toggle, Esc.
- [ ] T016 [US2] Put `BrandMenu` in the toolbar's brand slot. Keep the "N no project assigned" note, shown when exactly one brand is chosen: `header.noProject`, or `header.allAttached` when the count is 0.
- [ ] T017 [US2] Lab scenarios `h2-*`:
  - one brand: its name shows and the host's `brandIds` is `[id]`;
  - two brands: "2 brands";
  - All brands: `[]`;
  - every brand picked: back to `[]`;
  - the note shows only for one brand;
  - a brand with no logo shows its initial;
  - 12 brands at 1280 px: the toolbar is still one line (SC-005).

---

## Phase 5: User Story 3: a quieter Inbox (P2)

**Goal**: A compact Inbox button with its count badge. The summary moves into the tooltip and the accessible name.

**Independent Test**: 8 items with one late: "Inbox 8" with an orange badge, and the summary in the tooltip and the accessible name. With nothing waiting: no badge, "All clear".

- [ ] T018 [US3] Add a `variant?: 'full' | 'compact'` prop to `src/components/inbox/InboxButton.tsx`:
  - **Compact:** the tray icon, the bold label, and the badge (the same `is-urgent`, the same 99+).
  - **The summary** keeps `data-inbox-summary` and becomes visually hidden (`fx-sheet-sr`). The button gets `title={summary}`.
  - **No fill** in any state. The `is-zero` and ring classes are kept.
  - Add the compact styles to CSS: 42 px high, a hover fill of `PIPE.surface`, and the badge inline after the label on desktop.
- [ ] T019 [US3] Add `variant?: 'sidebar' | 'rail' | 'header'` to `src/components/shared/UserMenu.tsx`:
  - **Header trigger:** the avatar (photo via `ImageWithFallback`, or initials on `avatarColor`), 40 px, with a 2.5 px `#A855F7` ring, `data-account`, and `aria-label` from `header.account`.
  - **Panel:** opens downward, placed by `top = rect.bottom + 8` and aligned to the trigger's inline end.
  - **Contents:** the same profile, password and sign-out panels.

  Use both variants from Board.
- [ ] T020 [US3] Lab scenarios `h3-*`:
  - `#inbox=urgent`: the badge reads 8 with `is-urgent`, `title` holds the summary, and the accessible name includes the count and summary;
  - `#inbox=normal`: a purple badge;
  - `#inbox=clear`: no badge, `is-zero`, and the title "All clear";
  - a click toggles the host's panel;
  - the avatar opens the account menu below itself;
  - Esc returns focus.

---

## Phase 6: User Story 4: page tabs and the Board | Sheet pair (P2)

**Goal**: Pipeline | Content are the page tabs. Board | Sheet lives in the toolbar and in the video sheet's bar. The title follows the tab, and saved links still work.

**Independent Test**:
- Board → Sheet keeps the Pipeline tab selected and updates the address.
- Content shows its own bar and the title "Content".
- Back and saved links work.

- [ ] T021 [US4] In `src/components/sheet/VideoSheet.tsx`:
  - **The bar:** replace the three-way switch with `<ViewPair view="sheet" onView={…}>` at the bar's end, after Paste clips. Add `data-toolbar`. The sets, Back to all, Columns, Mine, Show dropped and Paste clips are unchanged.
  - **Search:** add a `query?: string` prop. Filter rows with a new `filterRowsByQuery` in `src/components/sheet/rows.ts`: a matching clip (title or file name) is kept with its video, and a matching video keeps its clips (R6).
- [ ] T022 [US4] In `src/components/content/ContentSheet.tsx`:
  - **The bar:** remove the three-way switch and add `data-toolbar`. Columns, Mine, Show archived, + Theme and Paste plan are unchanged.
  - **Search:** add a `query?: string` prop. Filter rows in `src/components/content/rows.ts`: a matching piece is kept with its theme and pillar rows, and a matching theme keeps its pieces.
- [ ] T023 [US4] In Board:
  - **`lastPipelineView`** state, kept in step whenever `view` is board or sheet; the Pipeline tab restores it.
  - **The search box** passes `filters.search` as `query` to both sheets.
  - **Removed:** the sheets' `onView('content')` and `onView('board')` paths that only the old switch used. "Open video sheet" from Content still sets `view='sheet'`.
- [ ] T024 [US4] Lab scenarios `h4-*`:
  - the tab and pair states for each `#view`;
  - Sheet: Pipeline stays selected and the host's view is 'sheet';
  - the Content tab: the title is "Content" and the toolbar is the Content bar (no `data-view-pair` in it);
  - Pipeline returns to the last pipeline view.

  Add to the sheet lab:
  - `pipe-view-pair` (the video sheet bar's `ViewPair` calls `onView`);
  - `pipe-query` (`query` narrows rows and keeps parents) in `scripts/sheet-lab/scenarios/`;
  - update any scenario that clicked the old three-way switch.

---

## Phase 7: User Story 5: the header on a phone (P2)

**Goal**: A compact phone header. Search folds into an icon, the toolbar scrolls sideways, and every target is at least 44 px.

**Independent Test**: At 390 × 700 the first column starts at 320 px or less, and every control can be reached.

- [ ] T025 [US5] Phone search in the header:
  - `searchOpen` local state, with the search icon (`data-search-open`) and a ✕ (`data-search-close`);
  - open: the field fills the top bar and takes focus;
  - Esc or ✕ closes it, keeps the text, and returns focus to the icon.
- [ ] T026 [US5] Phone CSS at 767 px and under (contract §4):
  - **top bar:** the tabs, the search icon, the Inbox icon with a corner badge (ringed in white), the avatar at 36 px; the dividers are hidden;
  - **title row:** 64 px, title 28 px, New task 44 px;
  - **toolbar:** `overflow-x: auto`, scroll snapping, no scrollbar, controls at least 44 px, the no-project note hidden;
  - **1024–1279 px:** the far-end group shows icons only, and search narrows (FR-040).
- [ ] T027 [US5] Lab scenarios `h5-*` at 390 × 700:
  - the top bar's contents;
  - search opens with focus, and Esc keeps the text;
  - the toolbar's `scrollWidth` is greater than its `clientWidth`, and the page does not scroll sideways;
  - every control at least 44 × 44;
  - at 1100 px the far-end labels are hidden but the `aria-label`s are present.

---

## Phase 8: User Story 6: Arabic and keyboard (P3)

**Goal**: The header mirrors in Arabic, and every control works with the keyboard alone, in screen order.

**Independent Test**: In Arabic the header mirrors and every label is Arabic. With the keyboard alone, every control can be reached and used, top bar first.

- [ ] T028 [US6] Check that the header and toolbar use logical properties only (`inset-inline-*`, `margin-inline-*`, `padding-inline-*`), that the ticks and chevrons mirror, and that popovers open toward the start side in RTL. Fix any physical left or right values found in T013 and T026.
- [ ] T029 [US6] Lab scenarios `h6-*`:
  - `#locale=ar`: the tabs are on the right (bounding box) and the avatar on the left, with every header label in Arabic and no `MISSING_MESSAGE`;
  - Tab order from the page start matches contract §3;
  - each dropdown (brands, Filters, Display options, avatar): Enter opens with focus inside, ↓ moves, Esc closes and returns focus to its trigger;
  - ←/→ on the tabs;
  - axe on the header, toolbar and open dropdowns, in English and Arabic, with no critical or serious issues;
  - messages parity for `header.*`.

---

## Phase 9: Polish and validation

- [ ] T030 Run:
  - `npm run lab:header`, `lab:sheet`, `lab:inbox`, `lab:attachments` and `lab:brief`;
  - `npm run typecheck`;
  - `bash scripts/preflight.sh`;
  - `npx next build` (`rm -rf .next` first if the font error recurs).

  Update the inbox lab's selectors if the compact variant changes what they read.
- [ ] T031 Running-app checks (quickstart §3) against `next dev` on local PostgreSQL, as an admin and as the Content Creator:
  - measure the first column's top at 1440 × 900 (≤ 280) and at 390 × 700 (≤ 320);
  - run all ten rows of quickstart §3 and seed 12 brands for SC-005;
  - take before and after screenshots.

  Record everything in `specs/011-board-header/validation.md`.
- [ ] T032 [P] Docs:
  - `specs/011-board-header/constitution-check.md`, including the supersession of spec 006 FR-012a;
  - a "Board header" section in `HANDOVER.md`: the files, the tab and view mapping, the third row per view, and search on the sheets;
  - a note in `specs/006-board-inbox/spec.md` next to FR-012a that spec 011 FR-012 replaces it;
  - mark this file's tasks [X].
- [ ] T033 Commit and push. Open a PR titled "A calmer Board header (spec 011)" and ask the user before merging.

---

## Dependencies

- Setup (T001–T002) → Foundational (T003–T006) → **US1** (T007–T014, the MVP).
- **US2** depends on US1's toolbar slot (T009, T012).
- **US3** depends on US1's header slots (T007, T012).
- **US4** depends on the page column (T005) and `ViewPair` (T006). It can run beside US2 and US3.
- **US5** depends on US1 to US3, because it styles their final markup.
- **US6** comes after US5, because it audits the final CSS.
- **Polish** comes last.

## Parallel examples

- **Foundational:** T003, T004 and T006 touch different files.
- **US1:** T008 (`TitleTicks`) beside T007. T010 (Filters) and T011 (`ViewMenu`) beside each other.
- **After US1:**
  - US2 (`BrandMenu.tsx`);
  - US3 (`InboxButton.tsx`, `UserMenu.tsx`);
  - US4 (`VideoSheet.tsx`, `ContentSheet.tsx`, both `rows.ts`).

  These are three disjoint file sets. They all meet in Board, so their wiring tasks (T016, T019, T023) run one after another.

## Implementation strategy

1. **MVP = Setup, Foundational and US1.** The header is in three rows on Board, with nothing lost. Check it against the reference.
2. **Then the rest, in order:**
   - US2: brands;
   - US3: the Inbox and avatar;
   - US4: the tabs, and the pair on Sheet and Content.

   Each one is checked in the lab as it lands.
3. **Then:**
   - US5: the phone;
   - US6: Arabic and the keyboard.
4. **Last:** validation and the running-app measurements, the docs, and the PR.

Each story ends with green lab scenarios, so it can be shown on its own.
