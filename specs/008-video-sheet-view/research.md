# Research: Video Sheet View

**Feature**: spec 008 · **Date**: 2026-11-04 · **Plan**: [plan.md](./plan.md)

Every open question from the Technical Context is settled here. Each decision says what was chosen, why, and what else was weighed.

---

## R1. Where clip details live

**Decision**:
- Add a new 1:1 table, `TaskClip`, keyed by the clip's task id. It holds `video_id`, `clip_no`, `source`, `file_name`, `in_ms` and `out_ms`.
- Add two nullable columns to `Task`: `published_url` and `dropped_at`.
- Apply the change with `prisma db push`, as every schema change here does (`scripts/migrate.sh`).

**Rationale**:
- Clip numbers, sources and in/out times only mean something for a cut of a video, so they stay off `Task`, which already has 25 columns.
- A unique index on `(video_id, file_name)` blocks a second paste from duplicating a clip, even when two people add the same clip at the same moment (edge case "two people paste"). Postgres allows many NULLs under a unique index, so clips without a file name are fine.
- `published_url` and `dropped_at` sit on `Task` because every task query has to filter or show them. A plain column is one `where: { dropped_at: null }`, with no join.

**Alternatives considered**:
- *All fields on `Task`*: simpler joins, but 6 video-only columns on every task, and the uniqueness rule would need a partial index Prisma can't declare.
- *JSON column on `Task`*: no uniqueness, and no typed validation.
- *A soft-delete flag via `status`*: rejected. A new status would change the pipeline (Constitution §II).

## R2. Who may add clips, and what a clip gets

**Decision**:
- Add a new server action, `addClips(videoId, rows)`. It only needs a signed-in member.
- The parent must be a task with content type `Video` that isn't itself a clip, and isn't dropped.
- Each row becomes a `Task`, with these values:
  - **Ownership**: `parent_task_id` = the video, `task_owner_id` = the member adding it, `assignee_id` = null.
  - **Type and status**: content type `Reel`, status `todo`, `stage_date` today.
  - **Copied from the video**: brand, project, platform and `nine_stage`.
  - **Defaults**: priority `Medium`, no due date, `created_by` and `initiator_role` from the member.
- Each row also gets its `TaskClip` details. A Drive link becomes a link-only attachment (R7).
- `createSubtask` and `requireTaskCreator` are not changed.

**Rationale**:
- The user decided that anyone may add clips (FR-030).
- A dedicated action keeps the exception narrow: it can only create Reel subtasks of a Video (FR-036). `user`-level members still can't reach `createTask`, `createTasks` or `createSubtask`.
- The member who adds a clip owns it, which matches §III's "own tasks only" for `user`.
- Due date and priority aren't copied, because a clip's schedule is its own; they can be set in the panel.

**Alternatives considered**:
- *Loosen `createSubtask`*: it would open every subtask, of every type, to every member. Too broad.
- *The video's owner owns new clips*: a Content Creator who pastes clips then couldn't edit or move them. That defeats the decision.

## R3. Which moves the status menu offers

**Decision**:
- Add a pure helper, `allowedStages(task, member)`, in `src/lib/stage-moves.ts`. It returns every stage on the task's path except the current one, but only when the member holds the current stage or is admin or superuser. Otherwise it returns nothing.
- "Holds the current stage" is the existing rule:
  - a review stage (`owner_role` set): the member's role matches it;
  - a working stage: the member is the assignee or the owner.
- `setTaskStage` and `moveTask` call the helper instead of repeating the rule.
- The sheet's menu has three groups, in this order:
  1. **Next**: the next stage, highlighted;
  2. **Back to**: earlier stages, used when a review rejects;
  3. **Skip to**: later stages.
- A member with no allowed moves sees a plain status badge.

**Rationale**:
- FR-021 and SC-003 ask for exactly the board's moves, and a board drag may land on any stage in the path. Offering only "next" would make the sheet stricter than the board. Offering a stage the server then refuses would break FR-022.
- With one helper used by both server and client, the menu and the server can't disagree.
- Grouping keeps the common choice ("Next") one keystroke away.

**Spec correction**: US2 scenario 2 said "the next stage when they own the current one, plus the admin and superuser override moves". The board actually allows any stage in the path to whoever holds the current stage. The spec now says that (see plan.md, "Spec corrections").

**Alternatives considered**:
- *Next stage only*: simpler, but it disagrees with the board (SC-003), and a rejected review couldn't be sent back from the sheet.

## R4. Video stage names

**Decision**:
- The names are strings in a new `sheet` message namespace, `sheet.stage.<stageId>`, in `messages/en.json` and `messages/ar.json`.
- `src/lib/stage-meta.ts` gains `VIDEO_EDITING_STAGES` (`r-design`, `d-prog`, `d-check`, `final-check`) for the summary's "editing" count. It gains no labels.
- The hover and focus title is `"{video} · {real}"`, using the real `STAGE_META[id].label_en` (or `label_ar` in Arabic).

| Stage | English | Arabic (proposed; native review in the PR) |
|---|---|---|
| todo | To Do | STAGE_META label_ar |
| c-prog | Script | النص |
| c-final | Script Review | مراجعة النص |
| c-check | Script Check | اعتماد النص |
| r-design | Ready to Edit | جاهز للمونتاج |
| d-prog | Editing | مونتاج |
| d-check | Edit Review | مراجعة المونتاج |
| final-check | Final Cut | النسخة النهائية |
| ready-publish, scheduled, publish | unchanged | STAGE_META label_ar |

**Rationale**:
- They are display labels only (FR-013). Keeping them in messages means the lab's parity check covers them.
- No stage id, order or owner changes, so §II holds.

**Alternatives considered**:
- *A `VIDEO_STAGE_LABELS` map in `stage-meta.ts`*: it would put user-facing copy outside the message files and outside the parity check.

## R5. Where the sheet lives, and how it stays in step with the board

**Decision**:
- The sheet is a second view inside `KanbanBoard`, chosen with a **Board | Sheet** toggle. It renders `VideoSheet` from the same `tasks` state the board uses.
- The board's hero cards, stat strip and filter bar are hidden in Sheet view. The board's me/team scope and filters don't apply; the sheet has its own **Mine** toggle (FR-054).
- The view lives in the URL: `?view=sheet`, plus `&video=<id>` for a single video and `&row=<taskId>` to highlight a row. It is written with `window.history.replaceState`, which Next.js 16 syncs with `useSearchParams` without a server round trip, so the view can be linked and reloads keep it.
- `TaskModal` gains **Open sheet** on Video tasks and on clips. On a clip it opens the parent video's sheet with the clip's row highlighted. From pages other than the board it navigates to `/board?view=sheet&video=…`.

**Rationale**:
- One state array means a move made in either view shows in the other at once (FR-023, SC-002). Moves made by other people arrive on the next `router.refresh()`, as on the board today.
- A separate route would mean a second loader and a second copy of every optimistic update.

**Alternatives considered**:
- *A route, `/board/sheet/[videoId]`*: clean URLs, but a duplicate data path and drift between views.
- *Remember Board/Sheet in localStorage*: the URL already keeps it per tab, and a link opens the right view.

## R6. Board data for the sheet, and dropped clips everywhere else

**Decision**:
- The board page's existing query adds:
  - `clip: { select: { clip_no, source, file_name, in_ms, out_ms, video_id } }`;
  - `content_type` on attachments (R7 needs it);
  - `dropped_at` on `subtasks`.
- `published_url` and `dropped_at` come with the task's own scalars.
- `KanbanBoard` splits its tasks once, at the top: `liveTasks` (no `dropped_at`) feeds the board, metrics, alerts, Inbox and bulk actions. Only the sheet gets every task.
- The other task queries add `dropped_at: null`:
  - `src/app/(app)/overview/page.tsx` (two queries);
  - `src/app/(app)/capacity/page.tsx`;
  - `src/actions/projects.ts:672` and the unattached count at `:703`;
  - the counts in `src/actions/members.ts:184–187`.

**Rationale**:
- FR-060 says a dropped clip is hidden from the board and excluded from SLA alerts, while the sheet still shows it greyed.
- One split, at the single entry point, is easier to audit than a filter in every component.

**Alternatives considered**:
- *Filter in the board query and load dropped clips separately for the sheet*: a second request, and two sources for the same tasks.

## R7. Drive and web links as attachments

**Decision**:
- A link is a `TaskAttachment` with:
  - `url` = the link;
  - no `data` and no `storage_key`;
  - `content_type` = `text/uri-list` (the registered MIME type for a list of URIs);
  - `filename` = `Google Drive` for `drive.google.com` and `docs.google.com`, otherwise the host name.
- `isLinkAttachment(a)` in `src/lib/attachments.ts` tests the content type.
- In spec 007's Attachments section, a link tile shows a LINK badge and opens in a new tab instead of the preview.
- A new server action, `addLinkAttachment(taskId, url)`:
  - is guarded like `addAttachments` (`mayAttachTo`);
  - accepts `http:` and `https:` only, up to 2,000 characters;
  - ignores a URL the task already has.

**Rationale**:
- No schema change is needed.
- The marker is explicit, so ClickUp-imported rows (also URL-only, but real files) keep opening in the preview.
- The Files cell shows "Drive" when any link is a Drive link, and "Link" otherwise.

**Alternatives considered**:
- *Store the link in a new `drive_url` column*: it wouldn't appear in the Attachments section or on the card (FR-043).
- *Treat every URL-only row as a link*: it would break imported images.

## R8. Uploading from a Files cell

**Decision**:
- Move `uploadToStorage` and `uploadForSection` out of `TaskModal.tsx` into `src/lib/attachment-upload.ts`, as `makeUploader({ taskId, hasStorage, t, onStored })`, which returns spec 007's `UploadFn`.
- `TaskModal` uses it unchanged, and the sheet's Files cell uses it too.
- The cell keeps its own small state (name, progress, error, retryable). It doesn't use `useUploadQueue`: one file per cell, and no duplicate-name prompt (a clash gets spec 007's "Keep both" name automatically).
- The size check comes first, against `limitFor(hasStorage)` (200 MB with storage, about 5 MB without). Over the limit, the cell says so and offers **Paste a link instead** (FR-042).
- **Cover for video files**: after a stored upload, the browser draws one frame (at 1 s, or the middle of a short clip) from a `<video>` element onto a canvas. It saves this as the 360 px `cover_thumb` through `setCoverThumb`.
  - This is a separate small copy. The video itself is never re-encoded (spec 007 FR-059).
  - If the browser can't decode the file, there is no poster ("where available", FR-043).

**Rationale**: One upload path means the no-compression rule, progress, Retry and the session and replay checks all apply to the sheet without copying 120 lines.

**Alternatives considered**:
- *Reuse `useUploadQueue` per cell*: it brings a duplicate prompt and multi-file intake the cell doesn't need.
- *Server-side posters (ffmpeg)*: a new dependency, and the bucket path never passes the bytes through the app server.

## R9. Reading pasted rows

**Decision**: a pure module, `src/components/sheet/parse-clips.ts`.

- **Reading the clipboard**:
  - `cellsFromHtml(html, parser)` reads `text/html` with `DOMParser`: table rows and cells, each cell's text and first `href`. Google Sheets wraps its rows in a `<table>` inside `<google-sheets-html-origin>`.
  - `cellsFromText(text)` reads `text/plain` as tab-separated rows.
  - HTML is preferred when present, because only it carries hyperlinks behind display text.
- **Parsing rows**: `parseClipRows(cells, existingFileNames)` returns `{ fresh, existing, unmatched }`.
  - **Clip file name**: the first cell matching `FILE_RE = /^(\d+)_(.+)_(\d+)m(\d+(?:\.\d+)?)s-(\d+)m(\d+(?:\.\d+)?)s\.(mp4|mov|m4v)$/i`. From it: `clip_no`, `source`, `in_ms` = (m·60 + s)·1000 rounded, `out_ms` likewise.
  - **Title**: the longest other cell that is neither a link nor the file name.
  - **Link**: the first `href`, or else the first cell that is an `http(s)` URL.
  - **Unmatched rows**: rows with any text but no clip file name. They keep their cells, so they can be fixed in place.
  - **Existing rows**: a file name already under this video, compared case-insensitively.
  - Empty rows are dropped.
- **Limit**: at most `MAX_PASTED` (200) rows per paste. Past that, the preview says how many were left out.
- **Server check**: `addClips` re-parses each file name with the same `FILE_RE`, from `src/lib/clip-file-name.ts`, which both sides import. It never trusts the client's times.

**Rationale**:
- These are the same rules as the approved preview, now testable in Node.
- Parsing again on the server stops a hand-made request from storing times that don't match the file name.

## R10. The grid

**Decision**:
- A `<div role="grid">` with `role="row"`, `columnheader`, `rowheader` (the title) and `gridcell`. `aria-rowcount` and `aria-colcount` are set, plus `aria-expanded` on video rows.
- Layout is CSS grid rows inside one scroll container. The header row is `position: sticky; top: 0`, and the row number and title columns are `position: sticky; inset-inline-start`.
- Rows are 24 px tall, with 12 px text. Long text is cut with an ellipsis and has a `title`.
- No virtual scrolling. A video has 10–60 clips. "All videos" starts with groups collapsed except the most recently updated three, so 1,000+ cells mount only when someone expands them all. This can be revisited if a real sheet passes about 1,500 rows.
- **Focus**: one roving `tabindex=0` cell. The keys are in contracts/sheet-ui.md.
- **RTL**: `dir` comes from the locale, and sticky columns use logical insets. ←/→ follow what is on screen.
- **Digits**: times and lengths are formatted by `formatClipTime(ms)` as `m:ss.s`, with `dir="ltr"` and tabular numbers, so they stay in Western digits in Arabic.

**Rationale**:
- A div grid gives sticky headers and columns in both directions without a table's sticky quirks.
- 24 px rows meet SC-007: at least 20 rows on a 1366×768 screen once the board's hero cards and stat strip are hidden.

**Alternatives considered**:
- *A data-grid library (AG Grid, TanStack Table)*: a new major dependency (Tech Stack), its own styling outside the tokens (§I), and more weight than 14 columns need.
- *`<table>`*: sticky first column plus sticky header misbehaves with `border-collapse`, and roving focus is the same work either way.

## R11. Inline editing and saving

**Decision**:
- **Saving by field**:
  - title, editor (assignee) and type: the existing `updateTask`;
  - clip number, source, file name, in, out and published link: the new `updateClip`, which creates the `TaskClip` row if it is missing (for subtasks made before this feature).
- **Optimistic**: the cell shows the new value at once. If the server refuses, it goes back, with the reason in an inline note, as moves do (FR-022).
- **In and out**: typed as `m:ss.s`, `mm:ss` or seconds. An out time before the in time is refused on the client, and again on the server (FR-038). Length is never stored; it is `out_ms − in_ms`.
- **+ Clip** adds a draft row on the client with its title cell in edit mode. The clip is created through `addClips` with one row when the title is committed, so no nameless task is ever stored. Esc on an empty draft removes it.
- **Editor menu**: people only, with editing roles first (the R12 regex), then the rest, then **Unassigned**. It is typeahead-filtered.

**Rationale**: It reuses the board's existing write paths and rules, so the sheet can't do anything the panel can't.

## R12. Column sets, Mine, Show dropped

**Decision**:
- `defaultColumnSet(role)` in `src/components/sheet/columns.ts`:
  - `/video|editor|motion|design/i` → `editing`;
  - `/content|copy|writer/i` → `copy`;
  - anything else → `full`.
- The column set is remembered in `localStorage` under `momentum.sheet.columns.<memberId>`. Show dropped is under `momentum.sheet.dropped` (default on).
- **Mine** isn't remembered: the sheet opens on the whole video (FR-054).
- Every read and write is wrapped in try/catch, as for `momentum.board.scope`.

**Rationale**:
- These are per-device preferences, like the board's scope and its upstream toggle, which already use direct `localStorage` keys.
- They aren't application data, and they aren't in the Zustand store, so §VI's "no persisted keys in the store" still holds. The PR's constitution check notes the precedent.

**Alternatives considered**:
- *A column on `Member`*: it would follow people across devices, but it's a schema change and a server action for a view preference.

## R13. Published link prompt

**Decision**:
- When a move to `publish` succeeds from the sheet, a small popover opens on that row's Published cell, with a link field, **Save** and **Skip**.
- Save calls `updateClip({ published_url })`. Skip closes it, and the cell then reads **Missing link** (FR-048).
- A board drag to Published doesn't prompt. The row simply shows Missing link in the sheet.

**Rationale**: The prompt belongs where the link will be shown. Board drags stay as they are.

## R14. Drop and Restore

**Decision**:
- `dropClip(taskId)` sets `dropped_at = now()`. It is guarded by `canAct`, and the task must be a clip (it has a `TaskClip` row).
- `restoreClip(taskId)` clears `dropped_at` and moves `stage_date` forward, so the SLA clock reads as it did when dropped:
  `stage_date = subtractBusinessDays(today, businessDaysBetween(stage_date, dropped_at))`.
  `subtractBusinessDays` is added beside `businessDaysBetween` in `src/lib/utils.ts`.
- Neither touches `status`, attachments or comments (FR-063).

**Rationale**:
- Counting business days, not calendar days, keeps the elapsed SLA exact across weekends (FR-061).
- SLA is computed on render (§II), so moving the stage date is how "the clock as it was" is expressed.

## R15. Tests

**Decision**: a new lab, `npm run lab:sheet` (`scripts/sheet-lab/`), on the pattern of `lab:attachments`.

- **Node checks**: `parse-clips` (the team's real file names, HTML with links, TSV, unmatched rows, existing rows, 200 rows), `clip-file-name`, `allowedStages` (every stage × role × access), `formatClipTime` and its parser, the summary counts, `defaultColumnSet`, `subtractBusinessDays` against `businessDaysBetween`, **tokens-only** (no colour literals in `src/components/sheet/`) and **messages-parity**.
- **Browser scenarios**: an esbuild bundle of `VideoSheet` with a stub host (contracts/sheet-ui.md), using Playwright with Chromium at `/opt/pw-browsers/chromium`. One or more scenarios cover each acceptance scenario, plus SC-007 (20 rows at 1366×657), keyboard-only paths, Arabic, phone width, and axe.
- **Real app**: quickstart §3, against local PostgreSQL, including the "user"-level paste and the board/sheet agreement checks.

**Rationale**: It's the same tooling as specs 005 and 007, with no new dependency.
