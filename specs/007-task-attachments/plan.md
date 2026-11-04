# Implementation Plan: Task Attachments, Tidy and Seamless

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `007-task-attachments`) | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/007-task-attachments/spec.md`, Option A ("Tidy") with extras S1–S11 and the no-compression rule.

## Summary

Rebuild the task panel's Attachments section as its own module:
- Newest first, with a neon-green Latest pill and names that keep their ending.
- Tall tiles, click-the-name rename, and a preview you can step through, zoom and close by clicking the dark area.
- Delete with a 5-second Undo that survives closing the panel.
- Adding files by paste, drop or browse, with per-file progress, honest failures with Retry, the size limit shown up front, and a choice when a name repeats.

Smaller extras: loading placeholders, "Show all" for long lists, a clickable 📎 count in the panel header, file chips on comments, and a ⋯ menu on phones.

The one rule that reaches the server is that images are stored exactly as added. The no-storage path stops shrinking pictures, so pictures over its ~5 MB limit are refused. There is no schema change.

The technical approach (details in [research.md](./research.md)):
- Extract the section from `TaskModal.tsx` (2,700 lines) into `src/components/kanban/attachments/`, following the brief editor's precedent (spec 005).
- Move delete timers to an app-level provider, so a delete started in a panel can still be undone after the panel closes.
- Upload through `XMLHttpRequest` for real progress.
- Record comment file chips as a token inside the comment text.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router (the constitution's table says 15; the repo is on 16, unchanged by this work)
**Primary Dependencies**: Existing only: next-intl (strings), Prisma v5 (unchanged schema), the object-storage helper behind `/api/attachments/[ref]`. No new runtime dependency.
**Storage**: PostgreSQL via Prisma. `TaskAttachment` rows unchanged. Files live in the bucket (`storage_key`) or, without one, inline as data URLs (`data`).
**Testing**: A new standalone lab, `npm run lab:attachments`, on the pattern of `lab:brief`: esbuild bundle, a stub host, and Playwright scenarios with Chromium at `/opt/pw-browsers/chromium`. Plus pure-function checks in Node, `npm run typecheck`, `next build`, and a run against the real app (quickstart §3).
**Target Platform**: Modern desktop and mobile browsers; the Cranl deployment (Linux, Node).
**Project Type**: Web application (single Next.js project).
**Performance Goals**: A pasted screenshot shows as a tile in under 1 s (SC-003). Grid and preview interactions answer in under 100 ms. No layout shift when files load (SC-010).
**Constraints**:
- Originals are never re-encoded (FR-059).
- Limits are 200 MB per file with storage, and about 5 MB without it (`MAX_ATTACHMENT_CHARS` = 7,000,000 data-URL characters).
- Server actions are capped at an 8 MB body.
- No new persisted client state, and no new table or column.
**Scale/Scope**: Tasks with 0–50 attachments (typical 1–8). One section, the preview overlay, the comment box, and two server touch points (no-storage upload, delete).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Gate | Status |
|---|---|---|
| **I. Design System Fidelity** | Colours from the token map, no ad-hoc hex. | **Pass, with work.** The section uses `TaskModal`'s local `CU` constants today. The new module uses `BRIEF_UI` and `COLORS` from `src/lib/tokens.ts`. The Latest pill is `COLORS.lime` with `BRIEF_UI.ink`, and any missing role (danger soft, file-kind badges) is added to `tokens.ts` as a named map (`FILE_KIND_COLORS`), following the `STAGE_COLORS` precedent. |
| **II. Workflow Pipeline Integrity** | No change to stages, SLA, or the stage model. | **Pass.** Not touched. |
| **III. Role-Based Feature Access** | Gates enforced in the UI *and* on the server. | **Pass.** Add, rename and delete render only when `canEdit` (owner, assignee, admin, superuser). The server's `mayAttachTo` guard stays on every route and action, including the new DELETE handler. |
| **IV. Design-Driven Development** | A standalone HTML design committed before UI work. | **Pass, with a task.** The approved preview "Task Attachments Options" is committed as `design/task-attachments.html` before any UI task (T001). It is plain HTML, as `design/brief-editor-ux.html` was in spec 005. |
| **V. Cultural UX** | Arabic as content data; celebrations untouched. | **Pass.** A new `attachments` namespace exists in `messages/en.json` and `messages/ar.json`. Right-to-left layout, with ←/→ following reading direction. Celebrations are not involved. |
| **VI. State Architecture** | No new persisted client state; Zustand for UI ephemera only. | **Pass.** Pending deletes live in a React context provider (memory only, cleared on page hide after flushing). Uploads, loading and preview state are component state. Nothing is persisted. |
| **Tech Stack** | No new major dependency. | **Pass.** None added. |

No violations, so Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-task-attachments/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R18
├── data-model.md        # Phase 1: entities, client state, state machines
├── quickstart.md        # Phase 1: how to validate
├── contracts/
│   ├── attachments-section.md   # Component props and the host contract
│   ├── server.md                # Upload paths, the DELETE handler, the comment file token
│   └── keyboard-and-a11y.md     # Keys, focus, announcements, touch
├── checklists/requirements.md   # From /speckit-specify
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
design/
└── task-attachments.html                # Approved preview (T001)

src/components/kanban/attachments/       # NEW: the section, extracted from TaskModal
├── AttachmentsSection.tsx               # Header (count, Newest first, Add files), grid, dupe bar, Show all
├── AttachmentTile.tsx                   # Picture button, name/rename, meta, hover/⋯ actions, error and upload states
├── AttachmentPreview.tsx                # Moved from TaskModal; list, counter, arrows, strip, zoom, swipe, PDF tab
├── PlaceholderTiles.tsx                 # Loading skeletons
├── useUploadQueue.ts                    # Intake → size check → duplicate check → per-file upload with progress, retry
├── names.ts                             # splitName, nextFreeName, sameName, screenshotName (pure)
├── order.ts                             # newestFirst, latestImageId (pure)
└── limits.ts                            # limitFor(hasStorage), formatBytes (pure)

src/components/shared/
└── PendingDeleteProvider.tsx            # NEW: owns delete timers + the bottom Undo message; flushes on pagehide

src/app/(app)/layout.tsx                 # Mount PendingDeleteProvider once for every page that opens a task
src/components/kanban/TaskModal.tsx      # Uses AttachmentsSection; paste listener; 📎 count button; comment chips; no-compression path
src/app/api/attachments/[ref]/route.ts   # + DELETE handler (keepalive flush on page hide), XHR-friendly POST unchanged
src/actions/tasks.ts                     # addAttachments: accept originals only (no shrink happens client-side any more); unchanged guard
src/lib/attachments.ts                   # + MAX_INLINE_BYTES (derived from MAX_ATTACHMENT_CHARS)
src/lib/tokens.ts                        # + FILE_KIND_COLORS, any missing roles for the section
messages/en.json, messages/ar.json       # + "attachments" namespace

scripts/attachments-lab/                 # NEW: standalone lab (build.sh, entry.tsx, scenarios.mjs, scenarios/*.mjs)
package.json                             # + "lab:attachments"
```

**Structure Decision**: Single Next.js project; the feature follows spec 005's layout:
- A feature folder under `src/components/kanban/`, with pure helpers kept separate so the lab can test them without a browser.
- A shared provider for the one piece of state that must outlive the panel.
- A lab under `scripts/`.

`AttachmentGallery.tsx` is not imported anywhere and is left alone; removing it is a separate clean-up.

## Phase 0: Research

All unknowns are resolved in [research.md](./research.md) (R1–R18). The decisions with the most impact:
- **R4, Undo that outlives the panel:** an app-level provider holds the timer, so no soft delete or schema change is needed.
- **R5, real upload progress:** `XMLHttpRequest` replaces `fetch` in `uploadOne`, keeping all its existing checks.
- **R6, no compression:** remove the 1600 px shrink from the no-storage path and check size before reading.
- **R10, comment file chips:** a `[📎 name](attachment:<id>)` token inside the comment text, rendered by the existing chip renderer.

## Phase 1: Design

- [data-model.md](./data-model.md): attachment fields used, client-only entities (upload job, pending delete, duplicate prompt), and their state machines.
- [contracts/attachments-section.md](./contracts/attachments-section.md): what `TaskModal` passes in and what the section calls back.
- [contracts/server.md](./contracts/server.md): upload (bucket and inline), the new DELETE handler, rename, and the comment token grammar.
- [contracts/keyboard-and-a11y.md](./contracts/keyboard-and-a11y.md): every key, focus move and announcement, plus touch behaviour.
- [quickstart.md](./quickstart.md): lab scenarios mapped to acceptance scenarios, and real-app checks, including the no-compression check (SC-011).

## Constitution Check (post-design)

Re-checked against the Phase 1 design:
- **§I**: holds. The token additions are named maps in `tokens.ts`, and the lab greps the new folder for hex and `rgba(` literals, as spec 005's lab did.
- **§III**: holds. The DELETE handler reuses `mayAttachTo`, and the section never renders edit controls without `canEdit`.
- **§VI**: holds. The provider is memory-only, and the DELETE flush on page hide sends nothing that wasn't already requested.

There are no new violations.

## Complexity Tracking

None.
