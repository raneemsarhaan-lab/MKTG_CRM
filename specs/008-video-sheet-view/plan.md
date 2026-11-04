# Implementation Plan: Video Sheet View

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `008-video-sheet-view`) | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-video-sheet-view/spec.md`, with the user's decisions:
- video stage names in the sheet only;
- anyone adds clips;
- both Drive links and uploads.

## Summary

Add a **Sheet** view beside the board: a dense, spreadsheet-like grid of each long-form video (a Video task) and its clips (Reel subtasks).
- **Same data as the board**: every row is a real card, and moving a clip in the sheet is the board's own move, with the same rules, SLA reset and celebration. The two views share one state.
- **Clips arrive by paste**: rows copied from the team's Google Sheet become clips, parsed from file names like `30_IMG_0296_6m12.4s-7m20.9s.mp4`. Any member may add them; the person adding owns them.
- **Inline editing**: cells edit in place, and the Editor cell assigns a person.
- **Files**: the Files cell takes a Drive link, an upload through spec 007's path (no compression), or both.
- **Fits each role**: column sets for editors and writers, a published-link prompt, and reversible Drop.

The technical approach (details in [research.md](./research.md)):
- **Data**: a new 1:1 `TaskClip` table, plus `published_url` and `dropped_at` on `Task`, applied with `db push` (R1).
- **Adding clips**: a narrow `addClips` action is the only creation path open to `user`-level members, and it only creates Reel subtasks of a Video (R2).
- **Moves**: one pure `allowedStages` helper is shared by `setTaskStage` and the status menu, so they can't disagree (R3).
- **Where it lives**: inside `KanbanBoard`, from the same `tasks` state, with the view in the URL (R5). Dropped clips are split out once for the board, and filtered in the other task queries (R6).
- **Links**: stored as `text/uri-list` attachments (R7). The spec 007 uploader is moved into `src/lib/attachment-upload.ts` and reused (R8).
- **Grid**: a div-based ARIA grid with sticky header and title column, and no new dependency (R10).

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router (the constitution's table says 15; the repo is on 16).

**Primary Dependencies**: Existing only: next-intl, Prisma v5, Zustand (`useUIStore` for the celebration and `selectedTaskId`), and the object-storage helper. No new runtime dependency; a grid library was rejected (R10).

**Storage**: PostgreSQL via Prisma:
- **New**: a `task_clips` table, and `tasks.published_url` and `tasks.dropped_at`, applied with `prisma db push`.
- **Links**: `TaskAttachment` rows with `content_type = 'text/uri-list'`.
- **Uploads**: unchanged (bucket, or inline without one).

**Testing**:
- A new `npm run lab:sheet` on the pattern of `lab:attachments`: Node checks for the pure modules, then Playwright scenarios against an esbuild bundle with a stub host.
- Regression runs of `lab:attachments` and `lab:brief`.
- `npm run typecheck`, `next build`, and a run against the real app (quickstart §3).

**Target Platform**: Modern desktop browsers first (the sheet is a desk tool); it remains usable on phones by scrolling sideways inside the grid. Deployed on Cranl (Linux, Node).

**Project Type**: Web application (single Next.js project).

**Performance Goals**:
- At least 20 clip rows visible at 1366×768 (SC-007).
- Cell focus and edit respond in under 100 ms.
- Pasting 13 rows takes under 1 minute end to end (SC-001); the server inserts 200 rows in under 3 s.
- The all-videos view mounts no more than about 1,500 rows before someone expands groups.

**Constraints**:
- Video names are display labels only (§II).
- The `user` exception covers clip subtasks only (FR-036).
- Uploads are never re-encoded (spec 007 FR-059). Limits are 200 MB with storage, about 5 MB without.
- Server action bodies are capped at 8 MB.
- Every colour comes from the token map (§I).
- Every string exists in English and Arabic (FR-080).

**Scale/Scope**:
- About 300 tasks today. Videos have 10–60 clips; tens of videos.
- One new view (8 components, 5 pure modules), 5 new server actions, 1 moved module (the uploader), and small edits to `KanbanBoard`, `TaskModal`, the attachments tile, 6 task queries, the types, the tokens and the messages.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Gate | Status |
|---|---|---|
| **I. Design System Fidelity** | Colours from the token map; no ad-hoc hex. | **Pass, with work.** A new `SHEET_UI` map in `src/lib/tokens.ts`, mirrored as `--sheet-*` variables. Stage dots use `STAGE_COLORS`. The lab's tokens-only check covers `src/components/sheet/`. |
| **II. Workflow Pipeline Integrity** | No stage added, removed, renamed or reordered; SLA computed on render; review ownership unchanged. | **Pass.** The video names are message strings shown only in the sheet (R4). Moves go through `setTaskStage`, whose rule is now the shared `allowedStages` (same behaviour). Drop is a flag, not a stage. Restore moves `stage_date` so the computed SLA is what it was (R14). |
| **III. Role-Based Feature Access** | Gates in the UI *and* on the server; `user` = own tasks only. | **Pass, with a sign-off.** Edit, upload, drop and move controls render only when `canAct` or `allowedStages` allow, and every action checks again on the server. **Exception for sign-off:** `user`-level members may add clips through `addClips` only. The clip is owned by the person adding it (so it is "their own task"), and it can only be a Reel subtask of a Video. `createTask`, `createSubtask` and the New task form are unchanged for `user` (FR-036). The PR's constitution check asks reviewers to approve it. |
| **IV. Design-Driven Development** | A standalone HTML design committed before UI work. | **Pass, with a task and a sign-off.** The "Momentum Video Sheet" preview is updated for the decisions (video names with real-name hover, grouped status menu, Files cell, column sets, Drop, paste preview with unmatched rows) and committed as `design/video-sheet.html` before any UI task. Like specs 005 and 007, it is plain, readable HTML rather than the bundled prototype format, so the format needs the same sign-off. |
| **V. Cultural UX** | Arabic strings; celebrations on own-stage forward moves only. | **Pass.** A new `sheet` namespace in both message files, with the proposed Arabic video names flagged for native review (R4). The grid mirrors in RTL, and times use Western digits. Status moves call the board's own move, so the celebration fires under the same rule. |
| **VI. State Architecture** | Ephemeral UI state in Zustand; no persisted store keys; unions in types first. | **Pass, with a note.** No new store state: the view and video live in the URL, and cell editing is local. The new unions (`SheetColumnSet`, `BoardView`, `SheetColumn`) go in `src/types/index.ts` first. The column-set and Show-dropped preferences use direct `localStorage` keys, following the existing `momentum.board.scope` and `momentum.board.upstream`. They aren't application data and aren't in the store; the PR notes the precedent. |
| **Tech Stack** | No new major dependency. | **Pass.** None added. |

No unjustified violations. The §III clip exception and the §IV design format are recorded under Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/008-video-sheet-view/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R15
├── data-model.md        # Phase 1: schema, client types, derived rows, state machines, validation
├── quickstart.md        # Phase 1: lab scenarios and real-app checks
├── contracts/
│   ├── server.md        # addClips, updateClip, drop/restore, addLinkAttachment, allowedStages, queries
│   ├── sheet-ui.md      # Components, host contract, columns, keyboard, screen readers, look
│   └── paste-format.md  # Clipboard reading, FILE_RE, row classification, preview copy
├── checklists/requirements.md   # From /speckit-specify
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
design/
└── video-sheet.html                      # Approved preview, updated (before UI work)

prisma/schema.prisma                      # + TaskClip; Task.published_url, Task.dropped_at

src/types/index.ts                        # + SheetColumnSet, BoardView, SheetColumn, ClipDetails; Task/attachment fields
src/lib/mappers.ts                        # map clip, published_url, dropped_at, attachment content_type
src/lib/stage-moves.ts                    # NEW: holdsStage, allowedStages (pure, server + client)
src/lib/stage-meta.ts                     # + VIDEO_EDITING_STAGES
src/lib/clip-file-name.ts                 # NEW: FILE_RE, parseClipFileName (pure, server + client)
src/lib/attachment-upload.ts              # NEW: makeUploader (moved from TaskModal), videoPoster
src/lib/attachments.ts                    # + isLinkAttachment, linkLabel
src/lib/utils.ts                          # + subtractBusinessDays
src/lib/tokens.ts                         # + SHEET_UI

src/actions/tasks.ts                      # + addClips, updateClip, dropClip, restoreClip, addLinkAttachment;
                                          #   setTaskStage/moveTask use allowedStages and refuse dropped
src/app/(app)/board/page.tsx              # select clip, attachment content_type, subtasks.dropped_at
src/app/(app)/overview/page.tsx           # dropped_at: null
src/app/(app)/capacity/page.tsx           # dropped_at: null
src/actions/projects.ts, members.ts       # dropped_at: null

src/components/sheet/                     # NEW
├── VideoSheet.tsx                        # Toolbar, summary, groups, single-video mode
├── SheetGrid.tsx                         # role=grid, sticky header/title, roving focus, keys, paste capture
├── StatusCell.tsx                        # Video name, real name, grouped move menu
├── EditorCell.tsx                        # People menu
├── FilesCell.tsx                         # Link paste, upload with progress, refusal, Retry, menu
├── PublishedCell.tsx                     # Link / Missing link, publish prompt
├── PastePreview.tsx                      # New / existing / unmatched, fix in place, Add N clips
├── parse-clips.ts                        # cellsFromHtml, cellsFromText, parseClipRows (pure)
├── rows.ts                               # buildRows, clip order, Mine, Show dropped (pure)
├── columns.ts                            # COLUMN_SETS, defaultColumnSet (pure)
├── summary.ts                            # summarise (pure)
└── time.ts                               # formatClipTime, parseClipTime (pure)

src/components/kanban/KanbanBoard.tsx     # Board | Sheet toggle, URL state, liveTasks split, SheetHost (shared move)
src/components/kanban/TaskModal.tsx       # Uses makeUploader; "Open sheet" on videos and clips; published link field
src/components/kanban/attachments/AttachmentTile.tsx   # LINK tile: opens in a new tab, no preview
src/app/globals.css                       # --sheet-* variables and the .fx-sheet-* block
messages/en.json, messages/ar.json        # + "sheet" namespace (incl. sheet.stage.*), attachments.link

scripts/sheet-lab/                        # NEW: build.sh, entry.tsx, stub host, scenarios.mjs, scenarios/*.mjs, seed.ts
package.json                              # + "lab:sheet"
```

**Structure Decision**:
- A single Next.js project, following the layout of specs 005 and 007: a feature folder with pure helpers kept apart so the lab tests them in Node.
- The sheet is hosted by `KanbanBoard`, so both views share one task state.
- Shared rules (`allowedStages`, `FILE_RE`, the uploader) live in `src/lib/`, imported by both server and client.

## Phase 0: Research

All unknowns are settled in [research.md](./research.md) (R1–R15). The decisions with the most impact:
- **R1, schema**: `TaskClip` with a unique `(video_id, file_name)` index makes duplicate pastes impossible even when two people paste at once.
- **R2, the clip exception**: one narrow action, owned by the person adding the clip.
- **R3, moves**: the menu shows every stage the board would allow, grouped Next / Back to / Skip to. This corrects the spec's "next stage plus overrides" wording.
- **R5 and R6, one state, one split**: the sheet reads the board's own tasks, and dropped clips are removed once for the board and filtered in the other queries.
- **R7 and R8, files**: links are `text/uri-list` attachments, and uploads go through the moved spec 007 uploader, with a client-drawn poster frame for videos.

## Phase 1: Design

- [data-model.md](./data-model.md): the schema change, client types, derived rows and summary, the paste preview model, state machines, and validation rules.
- [contracts/server.md](./contracts/server.md): five new actions, the changed move rule, and the six queries that must leave dropped clips out.
- [contracts/sheet-ui.md](./contracts/sheet-ui.md): components, the host contract (`api.move` is the board's own move), column sets, every key, ARIA, and the look.
- [contracts/paste-format.md](./contracts/paste-format.md): how the clipboard is read, the file-name grammar with examples, classification, and the preview copy.
- [quickstart.md](./quickstart.md): lab scenario ids per story, and 18 real-app checks, including the `user`-level paste and the concurrent-paste check.

## Spec corrections (made with this plan)

- **US2 narrative and scenario 2, FR-021**: the board lets whoever holds the current stage, or an admin or superuser, move a task to *any* stage on its path, not only the next one. The spec now says the menu lists exactly those moves, grouped with the next stage first. The intent is unchanged: "only the moves the board allows".

## Constitution Check (post-design)

Re-checked against the Phase 1 design:
- **§I**: holds. `SHEET_UI` is a named token map, and the lab greps `src/components/sheet/` for hex and `rgba(` literals.
- **§II**: holds. No stage data changed; `allowedStages` reproduces the existing rule exactly, and the lab checks it against the old inline logic for every stage, role and access combination. Drop and Restore don't touch `status`.
- **§III**: holds, with the recorded exception. Every new action checks on the server, and the UI hides what the server would refuse. `addClips` can't create anything but a Reel subtask of a Video owned by the caller.
- **§V**: holds. The celebration comes only from the shared board move.
- **§VI**: holds. No store change, and the new unions are in `src/types/index.ts` first. The localStorage preferences follow the board's existing keys.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| §III: `user`-level members may create clip subtasks (`addClips`) | The user's decision: clips arrive from whoever cut or wrote them, often Content Creators and Video Editors with `user` access | Keeping clip creation to creators would leave the paste flow to managers, which is why the team still keeps a Google Sheet. Loosening `createSubtask` would open every subtask type. |
| §IV: the design file is plain HTML, not the bundled prototype format | Same as specs 005 and 007: readable, and reviewable in a PR diff | The bundle format can't be reviewed line by line; sign-off is requested in the PR |
