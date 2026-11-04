---
description: "Task list for Video Sheet View"
---

# Tasks: Video Sheet View

**Input**: Design documents from `specs/008-video-sheet-view/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: The spec doesn't ask for test-first work. Each story ends with a **validation task** that adds its scenarios to the sheet lab (research R15, quickstart §2), as in specs 005 and 007. The repo has no other test runner.

**Organization**: Grouped by user story (US1–US7 from spec.md), so each can be built, checked and shipped on its own.

**Revised 2026-11-04** after /speckit-analyze:
- C1: the column-set and Show-dropped preferences stay in `localStorage`, now allowed by constitution 2.1.0 (§VI);
- T1: `addClips` locks the video row and skips duplicates itself, instead of relying on the unique index inside a transaction;
- I1: `updateClip` moved to Foundational and wired with the host in US1, so US7 doesn't depend on US4;
- U1: Preview from a Files cell opens the task panel's preview (new task in US5);
- U2: a clip is any child of a video, with or without details;
- G1–G6, I2–I7, U3, A1: smaller fixes in the tasks below.

**Conventions used throughout**

| Term | Meaning |
|---|---|
| Sheet dir | `src/components/sheet/` |
| Board | `src/components/kanban/KanbanBoard.tsx`, the sheet's host (contracts/sheet-ui.md §2) |
| Actions | `src/actions/tasks.ts` |
| Lab | `scripts/sheet-lab/`, run with `npm run lab:sheet` |
| Strings | Every new user-facing string goes through `useTranslations('sheet')`, with keys added to both `messages/en.json` and `messages/ar.json` in the same task. Use ICU plurals for counts. |
| Colours | Only from `COLORS`, `STAGE_COLORS`, `BRIEF_UI`, `ATTACH_UI` and the new `SHEET_UI` in `src/lib/tokens.ts`, or the `--sheet-*` CSS variables (Constitution §I) |
| CSS that needs selectors | Sticky cells, `:hover`, media queries and keyframes go in `src/app/globals.css` between `/* ─── Video sheet (spec 008)` and `/* ─── end video sheet`, with `.fx-sheet-` class names using only `--sheet-*` and existing variables |
| Before every commit | `npm run typecheck` |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US7 from spec.md

---

## Phase 1: Setup (shared infrastructure)

**Purpose**: The design file required by Constitution §IV, the lab every story validates against, and seed data.

- [X] T001 Create the §IV design file `design/video-sheet.html`.
  - Start from the "Momentum Video Sheet" preview (https://claude.ai/artifact/XgQ5cBf6bdn6QK4XERPaYf); read it with the Artifact tool (action `read`).
  - Update it for the plan's decisions:
    - video stage names, with the real name on hover (FR-010–FR-012);
    - the grouped status menu: Next / Back to / Skip to (research R3);
    - the Editor cell listing people;
    - the Files cell states: Drive, n files, uploading, too large with "Paste a link instead", failed with Retry;
    - the Editing / Copy / Full column sets, Mine and Show dropped;
    - the paste preview with its unmatched rows;
    - the Published prompt and "Missing link";
    - Drop and Restore.
  - Use only token colours, as plain, readable HTML (like `design/task-attachments.html`).
  - Publish it as an update to the same artifact for the user's approval, then commit it.
  - Every UI task below depends on this file.
- [ ] T002 [P] Create the lab in `scripts/sheet-lab/`, modelled on `scripts/attachments-lab/`:
  - `build.sh`: esbuild-bundle `entry.tsx` for the browser, with `next-intl` given both message files.
  - `index.html`.
  - `entry.tsx`: mounts `<VideoSheet>` with a **stub host** implementing `SheetHost` (contracts/sheet-ui.md §2). The stub:
    - holds tasks in React state;
    - implements every `api` call with a configurable delay and failure;
    - records calls with timestamps;
    - exposes `window.__lab` (calls, tasks, celebrations) to scenarios.
  - Setup is selected with `?scenario=`, `?me=<memberKey>`, `?locale=ar`, `?storage=0` and `?video=<id|all>`.
  - `scenarios.mjs`: the Playwright runner, using `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
    - It runs `pure.mjs` first.
    - It fails a scenario on any React "Maximum update depth" warning.
    - It reuses the axe scan from the attachments lab, and prints "N/N scenarios pass".
  - `scenarios/` holds the story files.

  Add `"lab:sheet": "bash scripts/sheet-lab/build.sh && node scripts/sheet-lab/scenarios.mjs"` to `package.json`, and `scripts/sheet-lab/out/` to `.gitignore`. Until T017 exists, `entry.tsx` may render a placeholder so the runner can be proven with one smoke scenario.
- [ ] T003 [P] Create lab fixtures in `scripts/sheet-lab/fixtures.ts`.
  - **Members**: Marketing Manager (admin), Brand Director, Managing Director, two Video Editors (`user`), a Motion Designer, a Content Creator (`user`) and a superuser.
  - **One video**, "Strategy Execution and Leadership", with 13 clips built from real file names (`04_IMG_0293_2m20.2s-3m49.0s.mp4` … `30_IMG_0296_6m12.4s-7m20.9s.mp4`):
    - stages mixed across the path, including two in `d-prog` assigned to different editors and one in `c-final`;
    - three published, one of them without a published link;
    - one dropped;
    - a repeated clip number;
    - one clip without times;
    - one subtask without clip details, made the way `createSubtask` makes it (typed Video, no `TaskClip` row).
  - **A second video** with 2 clips, and a video with none.
  - **Clipboard samples**: a Google Sheets `text/html` paste (`<google-sheets-html-origin>`, a table with `<a href>` Drive links) of 3 rows (1 new, 1 existing, 1 without a file name), its TSV equivalent, a 13-row paste, and a 210-row paste.
- [ ] T004 [P] Create `scripts/sheet-lab/seed.ts` (run with `npx tsx`). It writes the same fixture video and clips into the local database with Prisma, for quickstart §3, and is idempotent: it deletes and recreates by a fixed `external_id` prefix `sheet-lab:`.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: Schema, types, tokens, strings, the shared rules (`allowedStages`, `FILE_RE`), and the board query.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

- [ ] T005 In `prisma/schema.prisma`:
  - add `model TaskClip` exactly as data-model.md §1: `task_id` id with Cascade, `video_id` relation `"VideoClips"` with SetNull, `clip_no`, `source`, `file_name`, `in_ms`, `out_ms`, `created_at`, `@@unique([video_id, file_name])`, `@@index([video_id])`, and `@@map("task_clips")`;
  - add `published_url String? @db.Text` and `dropped_at DateTime? @db.Timestamptz(6)` to `Task`, with the `clip` and `video_clips` relations and doc comments in the file's style.

  Run `npx prisma generate`, then `bash scripts/migrate.sh` against the local database.
- [ ] T006 [P] In `src/types/index.ts` (first, per §VI):
  - add `SheetColumnSet`, `BoardView`, `SheetColumn` and `ClipDetails` (data-model.md §2);
  - add `published_url`, `dropped_at` and `clip` to `Task`, and `dropped_at` to the `subtasks` item type;
  - make sure `TaskAttachment.content_type` exists.

  In `src/lib/mappers.ts`, make `mapTask` map the new fields (dates to ISO strings), plus the attachments' `content_type`.
- [ ] T007 [P] In `src/lib/tokens.ts`, add `SHEET_UI` (`as const`): `grid`, `headerBg`, `headerInk`, `rowNo`, `frozenShadow`, `videoRowBg`, `highlight`, `droppedInk`, `missingLink`, `missingLinkBg`, `focus`, `menuNext` (`COLORS.lime`) and `menuNextInk` (`BRIEF_UI.ink`). Mirror each as a `--sheet-*` variable on `:root` in `src/app/globals.css`, and open the empty `/* ─── Video sheet (spec 008)` … `/* ─── end video sheet` block.
- [ ] T008 [P] Add a `sheet` namespace to `messages/en.json` and `messages/ar.json`:
  - `sheet.stage.<stageId>` for every stage, with the English and Arabic names in research R4; unchanged stages reuse their current names;
  - toolbar labels (Board, Sheet, Editing, Copy, Full, Mine, Show dropped, Paste clips, + Clip);
  - every column header;
  - the summary line;
  - status menu groups (Next, Back to, Skip to) and the "{video} · {real}" title;
  - Editor menu (Unassigned) and read-only hints;
  - Files cell texts (Drive, Link, n files, Upload, uploading %, too large with limit, Paste a link instead, Retry, Open link, Preview, Open task);
  - the paste preview copy (contracts/paste-format.md);
  - the Published prompt (Save, Skip, Missing link);
  - Drop, Restore, "Clip dropped · Undo";
  - every error code in contracts/server.md as a sentence;
  - live-region announcements.

  Also add `attachments.link` ("Link") and `attachments.openLink` to the `attachments` namespace.
- [ ] T009 [P] Create `src/lib/clip-file-name.ts` (pure, no React or Prisma): `FILE_RE` and `parseClipFileName(name) → { clip_no, source, in_ms, out_ms } | null`, rounding as in contracts/paste-format.md. A name whose out time isn't after its in time returns null.
- [ ] T010 [P] Create `src/lib/stage-moves.ts` (pure): `holdsStage(task, member)` and `allowedStages(task, member)`, exactly as contracts/server.md. In `src/lib/stage-meta.ts`, export `VIDEO_EDITING_STAGES = ['r-design', 'd-prog', 'd-check', 'final-check']`.
- [ ] T011 Refactor `moveTask`, `setTaskStage` and the status branch of `bulkUpdateTasks` in Actions to decide with `holdsStage` / `allowedStages`. Keep their results and `shouldCelebrate` rule unchanged, and refuse `dropped_at` tasks with `error: 'dropped'` (bulk counts them as refused). Depends on T005 and T010.
- [ ] T012 In `src/app/(app)/board/page.tsx`, extend the task query:
  - `clip: { select: { clip_no, source, file_name, in_ms, out_ms, video_id, created_at } }`;
  - `content_type: true` in the `attachments` select;
  - `dropped_at: true` in the `subtasks` select.

  Depends on T005.
- [ ] T013 Add `updateClip(taskId, patch)` to Actions, per contracts/server.md:
  - `canAct`;
  - the task must be a clip (its parent is a video);
  - upsert `TaskClip` with `video_id` from `parent_task_id`;
  - `0 ≤ in < out ≤ 24 h` (else `bad_times`);
  - `published_url` must be `http(s)` or empty (else `bad_link`);
  - P2002 returns `duplicate_file_name`;
  - revalidate.

  Depends on T005. US1 wires it into the host (T018), so US4 and US7 can both use it.
- [ ] T014 Add the pure checks in `scripts/sheet-lab/pure.mjs`:
  - `parseClipFileName` on every fixture name, plus `7_Cam A_take 2_0m05s-1m00s.MOV` and out-before-in;
  - `allowedStages` for every stage × every fixture member × 8- and 9-stage paths × dropped. Compare it against a copy of the **old** inline rule from `setTaskStage`, kept in the lab, to prove behaviour is unchanged (plan, post-design §II);
  - **tokens-only**: no hex or `rgba(` literal under `src/components/sheet/`;
  - **messages-parity**: `sheet` keys match in both files, and no Arabic value equals its English one unless listed as allowed (digits, "#").

  Depends on T009 and T010.

**Checkpoint**: The schema is applied, the board loads clip data, the moves use the shared rule, and the lab runs its Node checks.

---

## Phase 3: User Story 1 — See every clip of a video in one dense sheet (Priority: P1) 🎯 MVP

**Goal**: Board | Sheet; one video or all videos with clips as groups; a compact grid with frozen header and title, row numbers, video names, a summary line, and collapse; read-only at this stage.

**Independent Test**: The spec's US1 test. A video with 13 clips: open its sheet, and every clip appears once, in clip order, under the video row. The summary matches the rows, and rows are 24 px.

- [ ] T015 [P] [US1] Create the pure helpers:
  - `src/components/sheet/time.ts`: `formatClipTime(ms)` → `m:ss.s`; `parseClipTime(text)` accepting `m:ss.s`, `mm:ss`, `XmYY.Ys` and plain seconds, returning ms or null; `formatLength(ms)` → `15m 40s` for the summary;
  - `src/components/sheet/rows.ts`: `buildRows(tasks, { videoId, mine, showDropped, me, collapsed })` → `SheetRow[]`, and `videosWithClips(tasks)` (newest updated first), per data-model.md §3. A clip is any child of a video, with or without `clip` details (blank cells when missing). Clip order is `clip_no` (nulls last), then `clip.created_at`, then `created_at`;
  - `src/components/sheet/summary.ts`: `summarise(clips)` per data-model.md §3;
  - `src/components/sheet/columns.ts`: `COLUMN_SETS` (contracts/sheet-ui.md §3) and the `SheetColumn` order.
- [ ] T016 [US1] Create `src/components/sheet/SheetGrid.tsx`:
  - a `role="grid"` div, CSS grid rows of 24 px, a sticky header row, and sticky row-number and title columns using logical insets;
  - row numbers; video rows with a collapse button (`aria-expanded`), showing "{n} clips" when collapsed;
  - clip rows rendering every column of the active set **read-only** (title with ellipsis and `title`, #, type, status as dot plus video name with `title="{video} · {real}"`, editor name, source, file name, in, out, length in `dir="ltr"` tabular numbers, files summary, published link);
  - dropped rows struck through;
  - the ARIA roles and counts of contracts/sheet-ui.md §5;
  - **navigation only**: one roving `tabindex=0` cell, with ←/→ as seen on screen in RTL, ↑/↓, Home/End, Ctrl+Home/End, and Space to collapse.

  Add the `.fx-sheet-*` rules to the CSS block. Depends on T001 and T015.
- [ ] T017 [US1] Create `src/components/sheet/VideoSheet.tsx`:
  - a toolbar with the column-set switch (Full only, for now) and placeholders for Mine / Show dropped / Paste clips, filled by later stories;
  - the summary line from `summarise` (FR-004);
  - **single-video mode** when `videoId` is set: a back link to "All videos";
  - **all-videos mode**: every video with clips as a collapsible group. All are collapsed except the three most recently updated (research R10), and each group's title opens that video on its own;
  - the empty state for a video with no clips;
  - the `highlightId` row scrolled into view, with a 2 s highlight.

  Depends on T016.
- [ ] T018 [US1] In Board:
  - add a **Board | Sheet** toggle beside the scope control;
  - keep `view`, `video` and `row` in the URL with `window.history.replaceState`, read through `useSearchParams` (research R5);
  - in Sheet view, hide the hero cards, stat strip, filter bar and columns, and render `<VideoSheet>` from the same `tasks` state with a `SheetHost`. Wire `api.update` (`updateTask`) and `api.updateClip` (the foundational `updateClip`) now, each with an optimistic update of `tasks`, rollback on refusal, and `router.refresh()`. The other `api` calls are stubs that throw "not wired" until their stories wire them;
  - `onOpenTask(id, opts)` sets `selectedTaskId` (the `previewId` option is handled in US5).

  Add the `BoardView` to the types first (T006). Depends on T017.
- [ ] T019 [US1] In `src/components/kanban/TaskModal.tsx`, add **Open sheet** to the header for Video tasks and for clips (tasks with `clip` or a Video parent).
  - On the board, it calls back to the board to set `?view=sheet&video=<videoId>&row=<clipId>`.
  - Elsewhere (overview), it navigates with `router.push('/board?view=sheet&video=…&row=…')`.
- [ ] T020 [US1] Add lab scenarios `us1-1` … `us1-5` and `sc-007-rows` (≥ 20 clip rows visible at a 1366×657 viewport) in `scripts/sheet-lab/scenarios/us1.mjs`. Add pure checks for `formatClipTime` / `parseClipTime`, `buildRows` order, and `summarise` on the fixture (equal to a hand count) in `pure.mjs`.

**Checkpoint**: The sheet shows every video's clips, read-only, beside the board. This is the MVP slice.

---

## Phase 4: User Story 2 — Change status in the sheet, with the board's rules (Priority: P1)

**Goal**: The status cell offers exactly the board's moves for that member, and moves through the board's own move function, with the same rollback and celebration.

**Independent Test**: The spec's US2 test. As the clip's assignee, change Editing to Edit Review: the stub (and, in the app, the board) shows D-Check with today's stage date, and the celebration fires. As a member without the stage, the cell is a plain badge.

- [ ] T021 [US2] In Board:
  - extract the drop handler's move logic into one function, `moveTo(task, toStage)`, which does the optimistic update, calls `setTaskStage`, rolls back with the reason, calls `router.refresh()`, and `setCelebration` on `shouldCelebrate`;
  - use it for board drags (behaviour unchanged) and as `SheetHost.api.move`;
  - make `moveTo` return the `MoveTaskResult` so the sheet can show the reason.
- [ ] T022 [US2] Create `src/components/sheet/StatusCell.tsx`:
  - a badge (stage-colour dot plus video name; accessible name "{video}, {real}"), with a small visible tooltip "{video} · {real}" on hover **and on keyboard focus** (`:focus-visible`), linked by `aria-describedby` (FR-012);
  - when `allowedStages(task, me)` isn't empty, a menu (`aria-haspopup="menu"`) grouped **Next** (highlighted with `SHEET_UI.menuNext`) / **Back to** / **Skip to**, each item showing the video name and, faint, the real name;
  - keyboard per contracts/sheet-ui.md §4: Enter opens, ↑/↓ and Home/End move, typeahead, Enter chooses, Esc closes back to the cell;
  - choosing calls `api.move`. While it saves, the cell shows the new stage. On refusal it returns to the old stage, with the reason from the `sheet` error strings in a note linked by `aria-describedby` and announced in the live region (FR-022).

  Wire it into `SheetGrid` for the video row and the clip rows.
- [ ] T023 [US2] Add lab scenarios `us2-1` … `us2-5` in `scripts/sheet-lab/scenarios/us2.mjs`. `us2-2` checks, for every fixture member on every fixture clip, that the menu items equal `allowedStages` (SC-003). `us2-3` checks that a celebration is recorded only for own-stage forward moves. Also check that the tooltip is visible after focusing a status cell from the keyboard, and that moving the video row leaves its clips' stages unchanged (FR-024).

**Checkpoint**: Status changes in the sheet are the board's moves.

---

## Phase 5: User Story 3 — Anyone adds clips by pasting from Google Sheets (Priority: P1)

**Goal**: Paste rows (HTML or text), preview new / existing / unmatched, fix or leave out, and add. Any member may add clips, and they own what they add. Also + Clip.

**Independent Test**: The spec's US3 test. As a `user`-level member not on the video, paste the 3-row fixture: the preview shows "1 new · 1 already in the sheet · 1 without a clip file name", and Add creates exactly one clip, owned by them, in To Do, with its details and Drive link.

- [ ] T024 [P] [US3] Create `src/components/sheet/parse-clips.ts` (pure, with `DOMParser` passed in), per contracts/paste-format.md:
  - `cellsFromHtml(html, parser)`;
  - `cellsFromText(text)`;
  - `parseClipRows(cells, existingFileNames) → PastePreview`, using `parseClipFileName` from `src/lib/clip-file-name.ts`, the 200-row cap and `overflow`.

  Add pure checks to `pure.mjs` for `parseClipRows` (on cell arrays) and `cellsFromText`. Node has no `DOMParser`, and adding one would be a new dependency, so `cellsFromHtml` is tested in a browser scenario instead (T028).
- [ ] T025 [US3] Add `addClips(videoId, rows)` to Actions, per contracts/server.md and research R2:
  - any signed-in member;
  - `not_a_video` checks;
  - 1–200 rows;
  - server-side `parseClipFileName`;
  - `http(s)` links only;
  - one interactive transaction creating the `Task` (owner = caller, assignee null, `content_type_label: 'Reel'`, `status: 'todo'`, brand, project, platform and `nine_stage` from the video, priority Medium, `created_by`, `initiator_role`), its `TaskClip`, and a link `TaskAttachment` (`content_type: 'text/uri-list'`, `filename` from `linkLabel`);
  - inside the transaction, lock the video row first (`SELECT id FROM tasks WHERE id = $1 FOR UPDATE` via `$queryRaw`), read its clips' file names lower-cased, and skip rows whose lower-cased name is already there or repeats earlier in the batch, reporting them in `skipped`. Don't rely on catching P2002: a unique violation aborts the rest of a PostgreSQL transaction;
  - revalidate `/board` and `/overview`.

  Add `linkLabel(url)` and `isLinkAttachment(a)` to `src/lib/attachments.ts`. Leave `createTask`, `createTasks`, `createSubtask` and `requireTaskCreator` untouched (FR-036).
- [ ] T026 [US3] Create `src/components/sheet/PastePreview.tsx`:
  - a dialog with the summary line, then the new clips (#, title, source, in → out, length, link host) and a collapsed count of existing rows;
  - **unmatched rows**, each showing what was pasted, with inline Title and File name fields; a fixed file name re-parses and moves the row to New;
  - **Leave out** per row;
  - **Add {count} clips** (disabled at 0) calls `api.addClips`; the result message includes `skipped`;
  - Esc closes, and focus returns to the grid.

  Wire `api.addClips` in Board: an optimistic insert of the returned clips into `tasks` (with `clip`, owner, Reel, todo, and the link attachment), then `router.refresh()`.
- [ ] T027 [US3] Wire pasting in `SheetGrid` and `VideoSheet`:
  - a `paste` listener on the grid while no cell is editing, and the toolbar's **Paste clips** button (it opens the preview with a paste box);
  - multi-row clipboard content opens `PastePreview` for the current video, or for the focused row's video in all-videos mode;
  - **+ Clip** under the last row adds a `draft` row, focused in title edit mode. On commit it calls `api.addClips(videoId, [{ title }])`; Esc on an empty draft removes it (research R11). The draft's minimal title editor is reused by US4.
- [ ] T028 [US3] Add lab scenarios `us3-1` … `us3-5` in `scripts/sheet-lab/scenarios/us3.mjs`. They paste the HTML and TSV fixtures through a real `ClipboardEvent`. `us3-4` checks the recorded `addClips` call and the new rows' owner, type and status. Add `paste-13` (13 rows added end to end in under 1 minute, SC-001) and `paste-210` (overflow message). Add `paste-race` as a server check in T048 (two simultaneous `addClips` calls with the same row: one clip, the other reports it skipped).

**Checkpoint**: Any member can bring a batch of clips in from Google Sheets.

---

## Phase 6: User Story 4 — Assign editors and fill details inline (Priority: P2)

**Goal**: Spreadsheet-style editing of title, editor, type, #, source, file name, in, out and published link, for members who may edit the clip.

**Independent Test**: The spec's US4 test. Edit a title, the editor and an out time: the board card shows the title and assignee, and the length recomputes. A member without rights sees read-only cells.

- [ ] T029 [US4] Add cell editing to `SheetGrid`:
  - Enter / F2 / typing starts editing a text cell (typing replaces the value);
  - Enter saves and moves down, Tab / Shift+Tab save and move to the next / previous editable cell, Esc cancels, and blur saves (FR-037, FR-039);
  - cells in rows where `canAct` is false aren't editable and say why on Enter (a read-only hint).

  Fields and saves:
  - **title** → `api.update({ name })`;
  - **#** (integer 0–9999), **source**, **file name** → `api.updateClip`;
  - **in / out** parse with `parseClipTime`. Out not after in is refused on the client with a note (FR-038), and length recomputes at once;
  - all saves are optimistic on `tasks`, with rollback and the reason (as T022).
- [ ] T030 [P] [US4] Create `src/components/sheet/EditorCell.tsx`:
  - a menu of members: editing roles first (`/video|editor|motion|design/i`), then the rest, alphabetical within each, then **Unassigned**;
  - typeahead filter;
  - choosing calls `api.update({ assignee_id })`.

  Also add a **type** menu cell with the content types, calling `api.update({ content_type_label })`. Both are wired into `SheetGrid` (FR-025).
- [ ] T031 [US4] Add lab scenarios `us4-1` … `us4-5` in `scripts/sheet-lab/scenarios/us4.mjs`, including Esc restoring the value, Tab order across a row, and the editor list order.

**Checkpoint**: The sheet replaces the Google Sheet for day-to-day edits.

---

## Phase 7: User Story 5 — Attach the cut: a Drive link, an upload, or both (Priority: P2)

**Goal**: The Files cell attaches links and uploads through spec 007's path, with no compression, progress, limits, Retry and a preview; links appear in the Attachments section.

**Independent Test**: The spec's US5 test. Paste a Drive link (the cell reads "Drive"). Upload a file with progress. Over the limit, it is refused with "Paste a link instead". A failure offers Retry. The menu opens the link, the preview or the task.

- [ ] T032 [US5] Move `uploadToStorage` and `uploadForSection` from `src/components/kanban/TaskModal.tsx` into `src/lib/attachment-upload.ts`, as `makeUploader({ taskId, hasStorage, t, onStored }) → UploadFn` (research R8). Keep every check: own URL per file, JSON-only success, the session redirect, the ref echo, no re-encoding, and the inline limit before reading. `TaskModal` uses it with `onStored = router.refresh` and its current thumbnail step. Check: `npm run lab:attachments` still passes.
- [ ] T033 [US5] Add `videoPoster(file) → Promise<string | null>` to `src/lib/attachment-upload.ts`:
  - load the file in a hidden `<video>` from an object URL created and revoked in the same call;
  - seek to 1 s (or half the duration if shorter), draw to a canvas at a 360 px longest edge, and return a JPEG data URL (q 0.62);
  - time out after 8 s to null.

  `makeUploader` calls it for `video/*` after a stored upload and saves it with `setCoverThumb`, guarded (FR-043).
- [ ] T034 [P] [US5] Add `addLinkAttachment(taskId, url)` to Actions, per contracts/server.md: `mayAttachTo`, `http(s)`, ≤ 2,000 characters, the same URL returns the existing row, `content_type: 'text/uri-list'`, `filename` from `linkLabel`.
- [ ] T035 [P] [US5] In `src/components/kanban/attachments/AttachmentTile.tsx` and `AttachmentPreview.tsx`, make link attachments (`isLinkAttachment`):
  - show a LINK badge with the host name;
  - open in a new tab from the tile;
  - stay out of the preview's file list.

  Add a lab check to `scripts/attachments-lab/scenarios/` (`link-tile`).
- [ ] T036 [US5] Create `src/components/sheet/FilesCell.tsx`:
  - shows "Drive" / "Link" / "{n} files" from the task's attachments;
  - pasting a single URL into the focused cell calls `api.addLink` (FR-040);
  - **Upload** shows the limit up front ("Up to 200 MB", or "about 5 MB" without storage) and opens a file picker: the size check against `limitFor(hasStorage)` comes first, and over the limit the cell shows "Too large · {size}, over the {limit} limit" with **Paste a link instead**, which focuses a link field (FR-042);
  - otherwise it uploads through `api.upload(taskId)` with progress in the cell, and on failure shows the reason with Retry (FR-041);
  - Enter opens a menu: Open link (each link), Preview (`onOpenTask(taskId, { previewId })`, T037), and Open task (FR-045);
  - upload and link controls render only for `canAct` (FR-046).

  Wire it into `SheetGrid` for clips and the video row (FR-044). Wire `api.addLink` and `api.upload` (from `makeUploader`) in Board.
- [ ] T037 [US5] In `src/components/kanban/TaskModal.tsx`, accept `initialPreviewId`. After the Attachments section's first load, call `sectionRef.current.openPreview(id)`; closing the preview leaves the panel open. In Board, pass `opts.previewId` from `onOpenTask` through to the panel (FR-045).
- [ ] T038 [US5] Add lab scenarios `us5-1` … `us5-5` in `scripts/sheet-lab/scenarios/us5.mjs`, using the stub uploader with scripted progress and failure and a `File` reporting 7 MB and 210 MB. Check that no bytes are read before the refusal.

**Checkpoint**: Cuts and Drive links live on the clip, and show on its card and in its panel.

---

## Phase 8: User Story 6 — Each role opens on the columns it needs (Priority: P2)

**Goal**: Editing, Copy or Full by role on first open, remembered per member and device; Mine.

**Independent Test**: The spec's US6 test. The Video Editor opens on Editing, the Content Creator on Copy, the Marketing Manager on Full. Switch, reload, and the choice is kept. Mine shows only their clips.

- [ ] T039 [US6] In `src/components/sheet/columns.ts`, add `defaultColumnSet(role)` (research R12). In `VideoSheet`:
  - read and write `momentum.sheet.columns.<memberId>`, wrapped in try/catch;
  - enable the Editing / Copy / Full switch;
  - add the **Mine** toggle (not remembered), which filters clips through `buildRows({ mine })` while the video row and the summary stay (FR-053, FR-054).
- [ ] T040 [US6] Add lab scenarios `us6-1` … `us6-5` in `scripts/sheet-lab/scenarios/us6.mjs` (reload keeps the set; private-mode storage that throws still renders), and pure checks for `defaultColumnSet` on every fixture role.

**Checkpoint**: Each role sees a sheet sized for its job.

---

## Phase 9: User Story 7 — Published links and dropped clips (Priority: P3)

**Goal**: Ask for the post link on publish; Missing link; Drop and Restore with the SLA preserved; Show dropped; dropped clips off every other view.

**Independent Test**: The spec's US7 test. Move a clip to Published, skip the prompt, and the row says Missing link and the summary counts it. Drop a clip: it leaves the board and stays greyed in the sheet. Restore it: it returns at its stage.

- [ ] T041 [P] [US7] Create `src/components/sheet/PublishedCell.tsx`:
  - shows the link host (opens in a new tab), **Missing link** for a published clip without one (`SHEET_UI.missingLink`), or blank;
  - editable for `canAct` through `api.updateClip({ published_url })`.

  In `StatusCell` (T022), after a successful move to `publish`, open the prompt on that row's Published cell (link field, Save, Skip; Esc = Skip) (FR-047, FR-048, research R13).
- [ ] T042 [P] [US7] Add `subtractBusinessDays(date, n)` to `src/lib/utils.ts`, next to `businessDaysBetween`. Add `dropClip` and `restoreClip` to Actions, per contracts/server.md (`canAct`; the task must be a clip, its parent a video; restore re-dates `stage_date`; both idempotent; revalidate `/board`, `/overview` and `/capacity`). Add pure checks to `pure.mjs`: for every start weekday and n = 0…15, `businessDaysBetween(subtractBusinessDays(d, n), d) === n`.
- [ ] T043 [US7] Leave dropped clips out of everything but the sheet (research R6):
  - in Board, split `liveTasks = tasks.filter(t => !t.dropped_at)` at the top, and use it for the board, metrics, alerts, bulk actions and every count (and the Inbox, once spec 006 is built); only `VideoSheet` gets `tasks`;
  - add `dropped_at: null` to `src/app/(app)/overview/page.tsx` (both queries), `src/app/(app)/capacity/page.tsx`, `src/actions/projects.ts` (`:672`, `:703`) and `src/actions/members.ts` (`:184–187`);
  - in `TaskModal`'s subtask list, show dropped subtasks greyed with "dropped".
- [ ] T044 [US7] In `SheetGrid`, add a row menu (Enter on the row number, or a ⋯ on hover) with Drop or Restore (for `canAct`) and Open task, in **every** column set; keep the Drop / Restore column in the Full set; and add the **Delete** key:
  - Drop asks inline ("Drop clip {n}? It leaves the board and can be restored."), then calls `api.drop`, with "Clip dropped · Undo" in the live region and a 5 s Undo that calls `api.restore`;
  - Restore calls `api.restore` and applies the returned `stage_date`;
  - add the **Show dropped** toggle (`momentum.sheet.dropped`, default on) to `VideoSheet` (FR-060–FR-063);
  - the status cell of a dropped clip is read-only.

  Wire `api.drop` and `api.restore` in Board.
- [ ] T045 [US7] Add lab scenarios `us7-1` … `us7-5` in `scripts/sheet-lab/scenarios/us7.mjs`, including the summary's no-link count, dropped rows excluded from every other figure, Show dropped remembered, and `us7-restore-editing` (restore a dropped clip from the Editing set through the row menu).

**Checkpoint**: Every story works on its own and together.

---

## Phase 10: Polish and cross-cutting

- [ ] T046 [P] Add lab scenarios in `scripts/sheet-lab/scenarios/cross.mjs`:
  - `kbd-only` (each story's main action without the mouse, SC-008);
  - `rtl-grid`, `rtl-arrows` and `rtl-digits`;
  - `phone-390` (the grid scrolls inside its area; `document.scrollingElement.scrollWidth === innerWidth`);
  - `axe-grid`, `axe-status-menu`, `axe-editor-menu`, `axe-paste-preview`, `axe-files-menu` and `axe-publish-prompt` (no critical or serious issues).
- [ ] T047 Run `npm run typecheck`, `bash scripts/preflight.sh`, `npx next build`, `npm run lab:sheet`, `npm run lab:attachments` and `npm run lab:brief`. Fix anything that fails.
- [ ] T048 Run quickstart §3 against the running app (local PostgreSQL, `scripts/sheet-lab/seed.ts`, `next dev`), checks 1–19, including the simultaneous-paste check (row 7) and visible rows at 1366×768 (row 19, SC-007). Drive them with a script that also checks the database after each step, as spec 007 did. Fix what fails. Record the results in `specs/008-video-sheet-view/validation.md` in spec 007's format: static checks, lab, real app, bugs found and fixed, not verified here.
- [ ] T049 [P] Write `specs/008-video-sheet-view/constitution-check.md` for the PR, one row per principle. It explicitly asks reviewers to sign off on:
  - the §III exception (`addClips` for `user`-level members, scoped to Reel subtasks of a Video and owned by the caller);
  - the §IV plain-HTML design format;
  - the Arabic video stage names (native review);
  - the constitution amendment to 2.1.0 (§VI allows per-device view preferences in `localStorage`), made with this plan.
- [ ] T050 [P] Add a "Video sheet" section to `HANDOVER.md`: where the code lives, the new tables and columns (`db push` needed on deploy), the `lab:sheet` and seed commands, the clip-adding exception, the board-only move function, and the open item that uploads over about 5 MB depend on file storage (spec 007 T045).

---

## Dependencies and execution order

### Phase dependencies

- **Setup (1)**: no dependencies. T001 blocks every UI task (T016 onwards). T002–T004 can run alongside T001.
- **Foundational (2)**: after Setup's lab scaffold. T005 blocks T011 and T012. T009 and T010 block T014. Blocks all stories.
- **US1 (3)**: after Foundational. Every other story renders inside its grid.
- **US2 (4)** and **US3 (5)**: after US1. Independent of each other.
- **US4 (6)**: after US1. T029's editing infrastructure is reused by the + Clip draft (T027 keeps a minimal title editor until then). `updateClip` is foundational (T013) and wired in US1, so other stories don't wait for US4.
- **US5 (7)**: after US1. T032 and T035 touch spec 007 files and can start right after Foundational.
- **US6 (8)**: after US1.
- **US7 (9)**: after US1 and US2 (T041's prompt hooks into US2's `StatusCell`; saving uses `api.updateClip` from US1). T043 can start right after Foundational.
- **Polish (10)**: after the stories it covers.

### Story graph

```text
Setup ─▶ Foundational ─▶ US1 ─┬─▶ US2 ──────────┐
                              ├─▶ US3 ──────────┤
                              ├─▶ US4 ──────────┤
                              ├─▶ US5 ──────────┼─▶ Polish
                              ├─▶ US6 ──────────┤
                              └─▶ US7 (needs US2 for the prompt)
```

### Within each story

Pure helpers and server actions first, then components, then wiring into Board, then the lab scenarios.

### Parallel opportunities

- Setup: T002, T003 and T004 together, alongside T001.
- Foundational: T006, T007, T008, T009 and T010 together (different files); then T011, T012, T013 and T014.
- US1: T015 alongside T016's markup work.
- After US1: US2, US3, US4, US5 and US6 can be built in parallel by different people. Within them: T024 ∥ T025; T030 ∥ T029; T034 ∥ T035 ∥ T037 (∥ T032 earlier); T041 ∥ T042.
- Polish: T046, T049 and T050 together.

---

## Parallel example: after Foundational

```text
Task: "T015 [US1] Pure helpers time.ts, rows.ts, summary.ts, columns.ts in src/components/sheet/"
Task: "T032 [US5] Move the uploader into src/lib/attachment-upload.ts"
Task: "T034 [US5] addLinkAttachment in src/actions/tasks.ts"
Task: "T042 [US7] subtractBusinessDays + dropClip/restoreClip"
Task: "T043 [US7] dropped_at filters in overview, capacity, projects, members"
```

---

## Implementation strategy

### MVP first (US1, then the other P1 stories)

1. Setup, then Foundational: the schema is applied and the moves use the shared rule, with no visible change.
2. US1: a read-only sheet beside the board. Stop and check it with the Marketing Manager.
3. US2 and US3 complete the P1 release: the sheet moves clips with the board's rules, and anyone can paste clips in. This is the smallest release worth shipping, since it replaces the Google Sheet for tracking.

### Incremental delivery

4. US4 (inline edits) and US5 (files) make the sheet the place where work is done.
5. US6 (column sets) tidies the view per role.
6. US7 (published links, dropping) closes the loop.
7. Polish: cross-cutting checks, the real-app run, and the PR documents.

### Notes

- Every story keeps the board working: Sheet is a second view, and nothing in Board view changes except the shared move function (T021) and the dropped split (T043).
- `db push` must run on Cranl before the release that includes T005 (HANDOVER.md, T050).
- Commit after each task or small group, and run `npm run typecheck` before each commit.
