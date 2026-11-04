---
description: "Task list for Task Attachments, Tidy and Seamless"
---

# Tasks: Task Attachments, Tidy and Seamless

**Input**: Design documents from `specs/007-task-attachments/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: The spec doesn't ask for test-first work. Each story ends with a **validation task** that adds its scenarios to the attachments lab (research R18, quickstart §2), as in spec 005. The repo has no other test runner, and the plan names the lab as the acceptance check.

**Organization**: Grouped by user story (US1–US8 from spec.md), so each can be built, checked and shipped on its own.

**Revised 2026-11-04** after /speckit-analyze: pending deletes moved from a React context provider to the Zustand UI store (C1, T019); Download and Rename stay available on the grid through the P1 release (I1, I2: T011, T021); the preview walks every stored file (U1: T014, T036); two edge cases added (G1: T014, T019); the brief editor's no-storage paste note (I3: T027); a paste timing check (G2: T028); the §IV sign-off note (C2: T044).

**Conventions used throughout**

| Term | Meaning |
|---|---|
| Module dir | `src/components/kanban/attachments/` |
| Host | `src/components/kanban/TaskModal.tsx` |
| Pending deletes | The `pendingDeletes` slice of `src/store/useUIStore.ts`, timers in `src/lib/pending-deletes.ts`, the bottom message in `src/components/shared/PendingDeleteMessage.tsx` (research R4, Constitution §VI) |
| Lab | `scripts/attachments-lab/`, run with `npm run lab:attachments` |
| Strings | Every new user-facing string goes through `useTranslations('attachments')`, with keys added to both `messages/en.json` and `messages/ar.json` in the same task |
| Colours | Only from `BRIEF_UI`, `COLORS` and the new `FILE_KIND_COLORS` in `src/lib/tokens.ts`, or the existing `--brief-*` CSS variables (Constitution §I) |
| CSS that needs selectors | Media queries, keyframes and `:hover` go in `src/app/globals.css` under a `/* Task attachments (spec 007) */` block with `.fx-att-` class names, using only `--brief-*` variables |
| Before every commit | `npm run typecheck` |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US8 from spec.md

---

## Phase 1: Setup (shared infrastructure)

**Purpose**: The design file required by Constitution §IV, and the lab every story validates against.

- [ ] T001 Create the §IV design file `design/task-attachments.html` from the approved [interactive preview](https://claude.ai/artifact/FS7DUAN4cSyALZ2MNd7prK). Read it with the Artifact tool (action `read`) and commit its HTML as plain, readable HTML, like `design/brief-editor-ux.html` (plan.md Constitution Check §IV). Keep the Today / Option A / Option B tabs, and add a note at the top: "Option A · Tidy, with the Seamless extras, is the approved design (spec 007). Option B is not in scope." Every UI task below depends on this file.
- [ ] T002 [P] Create the lab in `scripts/attachments-lab/`, modelled on `scripts/brief-editor-lab/`:
  - `build.sh`: esbuild-bundle `entry.tsx` for the browser, with `next-intl` given `messages/en.json` / `messages/ar.json`.
  - `index.html`.
  - `entry.tsx`: mounts `<AttachmentsSection>` and `<PendingDeleteMessage>`, with a **stub host** implementing the props in `contracts/attachments-section.md`, and `src/lib/pending-deletes.ts` pointed at a fake `removeAttachment`:
    - `load` resolves after a configurable delay;
    - `upload` reports scripted progress, can fail at a given percentage, records every `File` it receives, and returns fake `TaskAttachment`s;
    - `rename` and `removeAttachment` are recorded with timestamps;
    - `?scenario=`, `?locale=ar`, `?readonly=1` and `?storage=0` select the setup.
  - `scenarios.mjs`: the Playwright runner, using `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`. It fails any scenario on a React "Maximum update depth" warning, reuses the axe scan from the brief-editor lab, and prints "N/N scenarios pass".
  - `scenarios/` for story files.

  Add `"lab:attachments": "bash scripts/attachments-lab/build.sh && node scripts/attachments-lab/scenarios.mjs"` to `package.json`. Until T009 exists, `entry.tsx` may render a placeholder, so the runner can be proven with one smoke scenario.
- [ ] T003 [P] Add lab fixtures in `scripts/attachments-lab/fixtures.ts`:
  - three portrait PNGs generated in the browser at known sizes, named "The Structural Gap - Post v1.png", "AI Adoption Gap - Post v2.png" and "Forefront Consulting - AI Gap Post v3 FINAL.png", uploaded 3 d, 1 d and 2 h ago by yosra;
  - "Brief - AI adoption figures.pdf" by Raneem, 4 d ago;
  - a .docx, a .zip and a .srt;
  - a 15-file set;
  - helpers that make a `File` reporting any size (7 MB, 12.4 MB, 210 MB) without allocating it, by overriding `size`.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: Tokens, strings, pure helpers, and moving the section out of the host with no visible change.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

- [ ] T004 [P] In `src/lib/tokens.ts`:
  - add `FILE_KIND_COLORS` (`pdf, video, document, spreadsheet, archive, subtitles, other`), lifting today's values from `fileBadgeColor` / `EXT_COLORS` in the host;
  - add any roles the section needs that `BRIEF_UI` lacks (`dangerSoft`, `uploading` purple), exported `as const`.

  The Latest pill uses `COLORS.lime` with `BRIEF_UI.ink`. Mirror any new colour used from CSS as a `--brief-*` variable in `src/app/globals.css`.
- [ ] T005 [P] Add an `attachments` namespace to `messages/en.json` and `messages/ar.json` with every string in spec.md and contracts/keyboard-and-a11y.md, each with an Arabic translation. That includes header labels, pills, tile meta, preview controls, Undo texts, upload states and errors, the size-limit lines, the duplicate bar, Show all / Show fewer, the ⋯ menu, comment chip texts and announcements. Use ICU plurals for counts.
- [ ] T006 [P] Create the pure helpers (no React imports):
  - `src/components/kanban/attachments/names.ts`: `splitName`, `nextFreeName`, `sameName`, `screenshotName`, per data-model "Derived values" and research R3/R8/R9;
  - `src/components/kanban/attachments/order.ts`: `newestFirst`, `latestImageId`, and `ageLabel(iso, now)` returning the key and values for "just now / Nm ago / Nh ago / yesterday / Nd ago";
  - `src/components/kanban/attachments/limits.ts`: `limitFor(hasStorage)` and `formatBytes`.

  In `src/lib/attachments.ts`, export `MAX_INLINE_BYTES = Math.floor((MAX_ATTACHMENT_CHARS - 256) * 3 / 4)` (R6).
- [ ] T007 [P] Create `src/lib/comment-files.ts` with `formatFileToken(name, id)` and `parseFileTokens(body)` → `Array<{ start, end, name, id }>`, implementing the grammar in contracts/server.md §4 (a `]` in names becomes `)`).
- [ ] T008 Add pure checks to the lab (`scripts/attachments-lab/pure.mjs`, run first by `scenarios.mjs`). They cover:
  - `splitName` on the fixture names, a 24-character name and an Arabic name;
  - `nextFreeName` with "(2)" already taken;
  - `newestFirst` ties;
  - `latestImageId` with a newer PDF;
  - `limitFor` both ways and `formatBytes` (220 KB, 12.4 MB);
  - the token round trip for names with `]`, emoji and Arabic.

  Depends on T006 and T007.
- [ ] T009 Extract the section without changing behaviour:
  - move the Attachments block (host lines ~2243–2460) into `src/components/kanban/attachments/AttachmentsSection.tsx`, and `AttachmentPreview` (host ~429) plus `FileTypeBadge` into `attachments/AttachmentPreview.tsx`;
  - give the section the props and `AttachmentsHandle` from `contracts/attachments-section.md`. `reveal`, `addFiles` and `openPreview` can call today's behaviour at first;
  - in the host, render `<AttachmentsSection>` and build `upload` from today's `uploadOne` (bucket) and a single-file version of `acceptFiles` (inline), `rename` from `renameAttachment`, and `load` from `loadAttachments`;
  - switch the moved code from `CU` constants to `BRIEF_UI` / `FILE_KIND_COLORS`.

  Depends on T004. Check: the app and the lab smoke scenario look exactly as before.
- [ ] T010 [P] In `src/actions/tasks.ts`, change `loadAttachments` to `orderBy: { uploaded_at: 'desc' }` (R2).

**Checkpoint**: The section renders from its own module, with the same look and behaviour, and the lab runs.

---

## Phase 3: User Story 1 — See which file is newest, and who added it (Priority: P1) 🎯 MVP

**Goal**: Newest first, a neon-green Latest pill on the newest image, names that keep their ending, uploader and age on every tile, and tall pictures.

**Independent Test**: The spec's US1 test. Three images an hour apart, with long names ending v1, v2 and v3 FINAL. v3 is first with the Latest pill, every tile shows uploader and age, and every ending is readable at 1360, 1000 and 390 px.

- [ ] T011 [US1] Create `src/components/kanban/attachments/AttachmentTile.tsx`:
  - the root is a `div` holding a picture `<button>` (4:5, `object-fit: cover` for images; otherwise a file icon plus extension badge in `FILE_KIND_COLORS`) and an info block;
  - the name is rendered from `splitName`: whole, or head (`.fx-att-l1`, one line with CSS ellipsis) plus tail (`.fx-att-l2`, never cut). The full name goes in `title` and the button's accessible name;
  - the meta line shows the avatar plus first name (fallback `ownerName`) and `ageLabel`;
  - pills sit at the top start corner. Add the `.fx-att-*` rules to `globals.css`;
  - **keep today's rename** (the pencil button and inline input, moved from the host) so the P1 release doesn't lose it. T029 replaces it with click-to-rename (I2).
- [ ] T012 [US1] In `AttachmentsSection.tsx`:
  - order with `newestFirst`;
  - add the header "Newest first";
  - put the "Latest" pill (`COLORS.lime` / `BRIEF_UI.ink`) only on `latestImageId`;
  - lay out the grid as `repeat(auto-fill, minmax(160px, 1fr))`, and two equal columns at ≤ 640 px (in `globals.css`);
  - render tiles with `AttachmentTile`;
  - remove the old 132 px white box.
- [ ] T013 [US1] Add lab scenarios `us1-1` … `us1-5`, `latest-is-image` and `names-at-widths` (quickstart §2) in `scripts/attachments-lab/scenarios/us1.mjs`.

**Checkpoint**: US1 works on its own; this is the MVP slice.

---

## Phase 4: User Story 2 — Preview and step through files (Priority: P1)

**Goal**: Counter, arrows, strip, keys, zoom, swipe, closing by clicking the dark area, PDFs in a new tab, and a no-preview fallback.

**Independent Test**: The spec's US2 test. Open the first of four, press → three times ("4 of 4"), click the picture to zoom, click the dark area to close, and focus is back on the tile.

- [ ] T014 [US2] In `attachments/AttachmentPreview.tsx`:
  - take `list` (stored files in grid order) and `index`;
  - add the counter ("2 of 4", polite live region), previous and next buttons, and a strip of every file with `aria-current`;
  - keys: ← / → (mirrored in RTL), Home / End, Esc;
  - trap focus inside the dialog and return focus to the source tile on close;
  - show uploader and age next to name and size in the top bar;
  - `list` holds **every** stored file in grid order, including those hidden behind Show all (FR-021). On close, if the last file shown is hidden, ask the section to show all, then focus its tile (FR-023);
  - if the file showing is deleted by someone else (it disappears from `list` on refresh), move to the next file, or close if none is left, with a short note (edge case, G1).
- [ ] T015 [US2] In `AttachmentPreview.tsx`:
  - a click on the image toggles zoom (scrollable, reset when changing file);
  - a click on the dark area outside the file and controls closes it;
  - a horizontal pointer swipe of more than 50 px on touch moves to the previous or next file.

  Disable transitions under `prefers-reduced-motion`.
- [ ] T016 [US2] In `AttachmentPreview.tsx`, add "Open in new tab" for PDFs (a real `<a target="_blank" rel="noopener">`), and the "no preview for .*ext* files" message with Download for other types. Exclude uploading and failed files from `list`.
- [ ] T017 [US2] In `AttachmentTile.tsx`/`AttachmentsSection.tsx`, the picture button opens the preview at that file's index. The name no longer links to the raw file (FR-010). Download is in the preview's top bar here, and on the tile's hover actions from T021, which lands in the same P1 release (I1).
- [ ] T018 [US2] Add lab scenarios `us2-1` … `us2-7`, `preview-includes-hidden` (15 files, Show all collapsed, step to the 12th, close → all shown, 12th focused) and `edge-deleted-while-previewed` in `scripts/attachments-lab/scenarios/us2.mjs`. us2-5 runs in a touch context.

---

## Phase 5: User Story 3 — Delete without fear (Priority: P1)

**Goal**: A 5-second Undo, which survives closing the panel, with nothing removed from storage before the window ends.

**Independent Test**: The spec's US3 test. Undo restores the file. Waiting 5 seconds deletes it. Closing the panel at once shows the bottom message, whose Undo restores the file.

- [ ] T019 [US3] Implement pending deletes per research R4 (Constitution §VI) and the PendingDelete state machine in data-model.md:
  - in `src/store/useUIStore.ts`, add a non-persisted `pendingDeletes` slice (entries keyed by attachment id: attachment, taskId, deadline, phase, label, pairedNewId) with the actions `requestDelete`, `undoDelete`, `panelClosed(taskId)` and `commitDelete`;
  - create `src/lib/pending-deletes.ts` for the timers (kept outside the store), keyed by id: commit via `removeAttachment` when a window ends; FR-035 (a new request commits the earlier one); `panelClosed` extends the deadline to ≥ 6 s from closing; `pagehide` flushes everything with `fetch('/api/attachments/<id>', { method: 'DELETE', keepalive: true })`;
  - export `usePendingDelete()` matching `contracts/attachments-section.md`, as a thin hook over the slice and the module, including `subscribe` for restores;
  - create `src/components/shared/PendingDeleteMessage.tsx`: the bottom message "Deleted / Replaced *name* · Undo" for `after-close` entries, bottom-centre, with safe-area insets and a polite live region. Mount it once in `src/app/(app)/layout.tsx`;
  - if Undo comes after someone else already removed the file, say it can no longer be restored (edge case, G1).
- [ ] T020 [P] [US3] Move the body of `removeAttachment` into a shared `deleteAttachment(id, member)` in `src/actions/tasks.ts`, keeping the guard, `deleteObject` and the `cover_thumb` clear. Then add a `DELETE` handler to `src/app/api/attachments/[ref]/route.ts` that authenticates, runs `mayAttachTo`, calls it, and returns 204 (also 204 when already gone), per contracts/server.md §2.
- [ ] T021 [US3] In `AttachmentTile.tsx`/`AttachmentsSection.tsx`:
  - with a mouse, **Download** and Delete buttons appear on hover or focus at the picture's corner, Delete neutral until hovered (Download is here so the P1 release keeps it after T017; I1);
  - pressing it calls `request(attachment)`;
  - a pending tile renders as the ghost ("Deleted *name* · Undo" plus a 5 s bar, or "5 s" text under reduced motion) and focus moves to Undo;
  - Undo calls `undo(id)` and focus returns to the restored picture;
  - restored files re-enter through `subscribe`.

  Edit controls render only when `canEdit`.
- [ ] T022 [US3] In the host, call `pendingDelete.panelClosed(task.id)` from `requestClose()` and in the component's unmount clean-up.
- [ ] T023 [US3] Add lab scenarios `us3-1` … `us3-5`, `no-store-before-window`, `panel-close-flush` and `edge-undo-gone` in `scripts/attachments-lab/scenarios/us3.mjs`. The stub host can unmount the section to simulate closing.

**Checkpoint**: All P1 stories are done. This is a releasable increment.

---

## Phase 6: User Story 4 — Add files every way, with honest feedback (Priority: P2)

**Goal**:
- Paste, drop or browse, with per-file progress.
- Limit shown up front, and too-large files refused before upload.
- Failures that keep their tile with Retry.
- A duplicate prompt.
- Originals stored byte for byte.

**Independent Test**: The spec's US4 test, plus the byte-for-byte check (quickstart §3 step 7).

- [ ] T024 [US4] Create `src/components/kanban/attachments/useUploadQueue.ts` implementing UploadJob and DuplicatePrompt (data-model.md):
  - `intake(files, { forComment, source })` caps at 12 and reports the skipped count;
  - `limitFor(hasStorage)` is checked **before** any read;
  - duplicates are found with `sameName` against stored files and queued;
  - jobs upload one at a time through the `upload` prop with progress (number or `null`);
  - `retry(key)` re-sends the kept `File`, and `remove(key)` drops it;
  - "Keep both" uses `nextFreeName`;
  - "Replace it" uploads and then calls `request(old, { label: 'replaced', pairedNewId })`;
  - `forComment` jobs call `onStoredForComment` when stored.
- [ ] T025 [US4] In the host, rewrite the `upload` adapter:
  - **Bucket**: `uploadOne` uses `XMLHttpRequest` with `upload.onprogress`. Keep the per-file `ref` path, a `Cache-Control: no-store` header, the login-redirect detection via `responseURL`, the must-have-`attachment` check and the `ref` echo check. Map failures to `{ ok: false, error, retryable }` per contracts/server.md §1.
  - **Inline**: remove `shrinkImage(file, 1600)` and send `readAsDataUrl(file)` for every file, one `addAttachments` call per file, with progress `null`.
  - Both paths still make the separate 360 px cover thumbnail after an image is stored (FR-059).
  - In `src/actions/tasks.ts`, reword `addAttachments`' too-large error to name the limit.
- [ ] T026 [US4] In `AttachmentsSection.tsx`/`AttachmentTile.tsx`:
  - an "Add files" button in the header and an "Add files" last tile ("Paste, drop or browse · Up to *limit* each"); remove the dashed drop box;
  - upload tiles with an "Uploading" pill and progress bar (indeterminate when `null`);
  - "Too large" tiles (size, limit, suggestion, Remove) and "Not uploaded" tiles (reason, Retry, Remove);
  - the duplicate bar (`role="alert"`: Replace it · Keep both · Cancel), one prompt at a time;
  - a "Drop to attach to this task" overlay while files are dragged over the panel;
  - upload and failed tiles always come first;
  - without `canEdit`, none of the add controls.
- [ ] T027 [US4] In the host:
  - route the window `drop` catch-all to `handle.addFiles(files, { source: 'drop' })`, keeping the `defaultPrevented` skip for the brief editor;
  - add a window `paste` listener while the panel is open (R9): skip when `defaultPrevented` or no files; rename generic clipboard names with `screenshotName(new Date())`; call `handle.addFiles(files, { source: 'paste', forComment: target is the comment textarea })`;
  - without `canEdit`, show the refusal note for paste and drop;
  - in the `briefEditor` namespace of `messages/en.json` and `messages/ar.json`, change the brief editor's no-storage upload note (`brief-editor/imageUpload.ts`, reason `no-storage`) to say the image can be pasted below the brief to attach it to the task (spec edge case; I3).
- [ ] T028 [US4] Add lab scenarios `us4-1` … `us4-7`, `no-image-shrink` and `limit-before-read` in `scripts/attachments-lab/scenarios/us4.mjs`. Run us4-3/us4-4 with `?storage=0` and `?storage=1`. us4-1 also asserts the pasted file's tile is visible within 1,000 ms of the paste event (SC-003; G2).

---

## Phase 7: User Story 5 — Rename by clicking the name (Priority: P2)

**Goal**: Click the name to edit the base name in place, with the extension fixed beside it.

**Independent Test**: The spec's US5 test.

- [ ] T029 [US5] In `AttachmentTile.tsx`, when `canEdit`:
  - the name is a button ("Rename *full name*"); click, Enter or F2 turns it into a text box holding the base name, fully selected, with the extension shown fixed beside it;
  - Enter or blur saves `base + ext`, not doubling the extension if it was typed; Esc cancels; an empty name keeps the old one;
  - call the `rename` prop and update the tile from its reply;
  - focus returns to the name.

  Remove the pencil button and inline input kept by T011. Without `canEdit`, the name is plain text.
- [ ] T030 [US5] Add lab scenarios `us5-1` … `us5-5` in `scripts/attachments-lab/scenarios/us5.mjs`. us5-5 uses `?readonly=1`.

---

## Phase 8: User Story 6 — Reach files from the header and from comments (Priority: P3)

**Goal**: The 📎 count jumps to Attachments; the comment box's paperclip attaches the file and puts a chip on the comment.

**Independent Test**: The spec's US6 test.

- [ ] T031 [US6] In the host, turn the 📎 count chip into a `<button>` ("Go to attachments") that calls `handle.reveal()`. In `AttachmentsSection.tsx`, implement `reveal()`: open if collapsed, `scrollIntoView({ block: 'start' })` (instant under reduced motion), and add `.fx-att-flash` for 1.3 s (keyframes in `globals.css`, none under reduced motion). The count shows stored files only.
- [ ] T032 [US6] In the host's comment box:
  - the paperclip opens the picker and calls `handle.addFiles(picked, { forComment: true })`;
  - keep `draftFiles` (job keys, then attachment ids via `onStoredForComment`) and show them as removable chips above the textarea;
  - on post, append `formatFileToken(name, id)` for each stored draft file on its own line, then clear the chips.

  A comment may be tokens only.
- [ ] T033 [US6] Extend `withRefs` in the host to find tokens with `parseFileTokens`, alongside @mentions and #tasks. Each renders as a file chip: thumbnail or extension badge plus the attachment's **current** name, opening `handle.openPreview(id)`. If the attachment no longer exists, show "*name* · deleted", not clickable. Colours come from tokens.
- [ ] T034 [US6] Add lab scenarios `us6-1` … `us6-3` in `scripts/attachments-lab/scenarios/us6.mjs`. The stub host renders a minimal comment box and list, using the host's `withRefs` export.

---

## Phase 9: User Story 7 — Long lists and loading stay calm (Priority: P3)

**Goal**: Placeholders at the final size while loading; seven newest files, then "Show all".

**Independent Test**: The spec's US7 test with 15 files and a 700 ms load.

- [ ] T035 [US7] Create `src/components/kanban/attachments/PlaceholderTiles.tsx`: `min(count, 7)` tiles at exactly the tile size with a shimmer (static under reduced motion), plus a `role="status"` "Loading *N* files…". `AttachmentsSection.tsx` shows it until `load()` resolves, with the count from `initialRows`.
- [ ] T036 [US7] In `AttachmentsSection.tsx`: with more than 7 stored files, show the newest 7 and a "Show all *N* files" button that toggles to "Show fewer". Upload and failed tiles always show first and don't count against the 7. The choice resets when the panel closes. Expose `showAll()` for the preview's close (T014).
- [ ] T037 [US7] Add lab scenarios `us7-1` and `us7-2` in `scripts/attachments-lab/scenarios/us7.mjs`. us7-1 measures the grid's top and bottom positions before and after loading (SC-010).

---

## Phase 10: User Story 8 — Phones and keyboard (Priority: P3)

**Goal**: A ⋯ menu on touch screens and two tiles per row; Delete and F2 on a focused picture; announcements.

**Independent Test**: The spec's US8 test at 390 px touch, and a keyboard-only run.

- [ ] T038 [US8] In `AttachmentTile.tsx` and `globals.css`:
  - under `@media (hover: hover)`, keep T021's Download and Delete hover buttons;
  - under `@media (hover: none)`, those are hidden and a single ⋯ button shows; its menu (`role="menu"`) holds Download, Rename and Delete, focus moves to the first item, and Esc or a click outside closes it and returns focus;
  - hit targets are at least 30 px.
- [ ] T039 [US8] In `AttachmentTile.tsx`, on the focused picture button, Delete/Backspace calls `request` and F2 starts renaming (when `canEdit`). In `AttachmentsSection.tsx`, add one polite live region for every announcement in contracts/keyboard-and-a11y.md.
- [ ] T040 [US8] Add lab scenarios `us8-1` … `us8-4` in `scripts/attachments-lab/scenarios/us8.mjs`, using a 390 px touch context and a keyboard-only run with no mouse events.

---

## Phase 11: Polish and cross-cutting

- [ ] T041 [P] Arabic pass:
  - every `attachments` string is translated;
  - the section, tiles, pills, the duplicate bar, the bottom message and the preview mirror correctly under `fluxo-locale=ar`;
  - ← moves to the next file.

  Add the lab guard `messages-parity` (identical key sets, no English left in Arabic), and an Arabic run of us1-1, us2-2 and us4-2.
- [ ] T042 [P] Add the lab guards `tokens-only` (no hex or `rgba(` in `src/components/kanban/attachments/` or `src/components/shared/PendingDeleteMessage.tsx`), `axe` (no critical issues in the section, preview, ⋯ menu or duplicate bar) and `render-loop`. Fix anything they find.
- [ ] T043 Run quickstart §1 (typecheck, `scripts/preflight.sh`, `next build`) and §3 against the running app (local Postgres, seeded team, `next dev`, no bucket), including step 7, the SHA-256 byte-for-byte check. Record the results, any bugs found and fixed, and what couldn't be verified in `specs/007-task-attachments/validation.md`, in the format of spec 005's. Optional (SC-001): ask five team members "which file is the latest?" on a task with three versions, and record how many answer correctly within 3 s; otherwise mark SC-001 as measured after launch (G3).
- [ ] T044 [P] Write `specs/007-task-attachments/constitution-check.md` (§I–§VI plus Tech Stack, for the PR description). Under §IV, state that `design/task-attachments.html` is plain HTML rather than the bundled prototype format and **ask reviewers to sign off** on that deviation, as §IV requires (C2). Under §VI, name the `pendingDeletes` store slice. Add a "Task attachments" section to `HANDOVER.md`:
  - the module layout;
  - pending deletes (store slice, timer module, bottom message);
  - the no-compression rule and the inline limit;
  - the comment token;
  - how to run `lab:attachments`.
- [ ] T045 On the Cranl deployment (bucket configured), run quickstart §4: smooth 0→100 % progress on a 5 MB paste, a 150 MB video stored byte for byte, a 210 MB file refused at once, and delete-during-upload counts. Record the results in validation.md. Leave this open until done there.

---

## Dependencies and execution order

### Phase dependencies

| Phase | Depends on | Notes |
|---|---|---|
| Setup (T001–T003) | none | T001 must be done before any UI task in Phases 3–10. |
| Foundational (T004–T010) | Setup | Blocks every story. T008 needs T006/T007; T009 needs T004. |
| US1 (Phase 3) | Foundational | T012 needs T011. |
| US2 (Phase 4) | Foundational | T017 uses `AttachmentTile` from T011 (US1). |
| US3 (Phase 5) | Foundational | T021 uses `AttachmentTile` (T011). T019 and T020 are independent of US1/US2. |
| P1 release | US1 + US2 + US3 together | T017 (US2) removes the name's raw-file link; T021 (US3) adds the hover Download button. Ship US2 and US3 together, or keep the name link until T021 lands. |
| US4 (Phase 6) | Foundational; "Replace it" needs T019 (US3) | Without US3, Replace can be held back and only Keep both / Cancel shipped. |
| US5 (Phase 7) | US1 (T011) | |
| US6 (Phase 8) | US4 (T024 for `forComment`), US2 (T014 for `openPreview`) | T031 needs only T009. |
| US7 (Phase 9) | US1 | |
| US8 (Phase 10) | US3 (Delete), US5 (Rename) | |
| Polish (T041–T045) | All stories intended for the release | |

### Story graph

```text
Setup → Foundational ─┬─ US1 (P1) ─┬─ US2 (P1) ─┐
                      │            ├─ US5 (P2)  │
                      │            └─ US7 (P3)  ├─ US6 (P3)
                      ├─ US3 (P1) ─┬─ US8 (P3)  │
                      │            └─ US4 (P2) ─┘
                      └─ (T031 any time after T009)
```

### Within each story

The UI follows `design/task-attachments.html`. Build state before UI, then wire the host, then add the lab scenarios. Run `npm run typecheck` and `npm run lab:attachments` before each commit.

### Parallel opportunities

- Setup: T002 and T003 alongside T001.
- Foundational: T004, T005, T006, T007 and T010 all in parallel (different files). T008 after T006 and T007; T009 after T004.
- After Foundational: US1 (T011→T012) and US3's T019/T020 in parallel (different files).
- T020 (server) runs in parallel with any client task.
- Polish: T041, T042 and T044 in parallel.

## Parallel example: after Foundational

```text
Agent A: T011 → T012 → T013 (US1, AttachmentTile + section order)
Agent B: T019 (pendingDeletes store slice + timer module + message) + T020 (DELETE route)   ← no shared files with A
Then:    T021–T023 (US3 tile wiring) once T011 exists
```

## Implementation strategy

### MVP first (US1)

T001–T013. The section is extracted and shows newest first, with the Latest pill, readable names, uploader and age. Validate with `lab:attachments` (US1 scenarios) and quickstart §3 step 1.

### Incremental delivery

1. **P1 release**: US1 + US2 + US3 (T001–T023). Picking, previewing and safely deleting versions.
2. **P2**: US4 (adding every way, honest failures, no compression) + US5 (rename).
3. **P3**: US6, US7, US8.
4. Polish: T041–T044, then T045 on Cranl.

### Notes

- Commit after each task or logical group; keep `npm run typecheck` green.
- `AttachmentGallery.tsx` is unused and is left alone (plan.md); removing it is a separate clean-up.
- Out of scope: S12 (attribution of imported files), and Option B (final version, chosen cover, compare).
