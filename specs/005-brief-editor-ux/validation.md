# Validation record: Brief Editor UX Overhaul

**Date**: 2026-11-04 · **Branch**: `claude/nice-noether-x4rgei`

How spec 005 was checked, and what was not. Use this in the PR description.

## 1. Static checks and build

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | **Not run.** `next lint` was removed in Next.js 16 (it fails with "Invalid project directory … /lint"), and the repo has no ESLint config or binary. Unchanged from before this work. |
| `bash scripts/preflight.sh` | Pass |
| `next build` (production) | Pass: every route compiles |

## 2. Editor lab: `npm run lab:brief`

**55/55 scenarios pass.** They run in a standalone page with the real editor and a stub host. Every acceptance scenario in quickstart.md §2 is covered, plus:

| Extra check | What it covers |
|---|---|
| `save-throw-is-a-failure` | A save that throws counts as a failure. |
| `upload-unavailable` | Pasting an image where uploads aren't possible explains why. |
| `paste-non-image` | Pasting a non-image file is refused with a hint. |
| `youtube-legacy` | Bare YouTube lines in old briefs open as video blocks. |
| `esc-from-toolbar-leaves-editing` | A bug found in the real app (§3). |
| `messages-parity` | English and Arabic have the same keys, with no English left in Arabic. |

The runner also fails any scenario that triggers React's "Maximum update depth" warning, a render loop found in the real app (§3).

**Round-trip fixtures** (FR-100, SC-010): every sample brief opens and saves unchanged, except two recorded cosmetic differences, which are both pre-existing:

- Checklists are saved as "loose" lists, with a blank line between items.

**Existing data bug, now fixed.** The first lab run found that an image followed by a table was saved on one line, which broke the table. Saving images as their own block (T022) fixed it, and that fixture now round-trips exactly. Details are in `scripts/brief-editor-lab/fixtures/README.md`.

## 3. The running app (quickstart §3)

Run against a local PostgreSQL with the seeded team and `next dev`, signed in as the admin, on a task whose brief is the `default` fixture.

| # | Check | Result |
|---|---|---|
| 1 | Click a word in the read brief | Editing starts with the cursor on that word; it moved **0 px**; no Edit or Done button. The typed text reached the database. |
| 2 | Esc with Insert open, then Esc again | First Esc closes only the menu. Second Esc ends editing and **the panel stays open**. This failed at first (the panel closed): see "Bugs found" below. |
| 3 | Click elsewhere in the panel | Editing ends. |
| 4 | Go offline, type, close the panel, go online, Retry | Status reads "Couldn't save · Retry". Closing asks "Stay · Leave anyway" once (it asked twice at first: see "Bugs found"). After Retry the text is in the database. |
| 5 | Paste an image with no bucket configured | The note "Image upload isn't set up here…" appears; nothing is inserted. |
| 6 | Long brief in the panel's scroll column | The toolbar stays pinned at the top of the column while the brief scrolls 3,000+ px. |
| 7 | **+ New Task** form | Pasting an image shows "Images can be added once the task is created"; the "/" menu works. |
| 8 | Arabic (`fluxo-locale=ar`) | The toolbar is labelled "التنسيق" and laid out right-to-left. |

The only console error was the expected `ERR_INTERNET_DISCONNECTED` while offline.

**Bugs found here and fixed in the same branch:**

- **Esc on the toolbar closed the whole panel.** After Esc closed a menu, focus returned to the toolbar button, and a second Esc reached the panel's own Esc handler. Esc inside the editor now always ends editing and is marked handled.
- **Two confirm bars.** Clicking the panel's ✕ with an unsaved brief showed both the editor's bar and the panel's. The panel no longer asks when the editor already has.
- **Render loop.** The link card's and table bar's settings were new objects on every render; the bubble-menu component re-sent them as a transaction each time, which re-rendered the editor ("Maximum update depth exceeded"). They are now stable.

## 4. Not verified here

| Item | Why |
|---|---|
| **Bucket upload of a pasted or dropped image, and SC-003 (5 MB in under 5 s)** | No object storage in this environment. The upload path is the existing `uploadToBucket` body, extracted unchanged into `uploadOne`. Check on the Cranl deployment: paste a 5 MB screenshot, time it, and confirm the attachment count goes up by exactly one. |
| **Drop onto the editor in the real panel, uploading once** | Needs the bucket. Covered by code: the panel's window `drop` handler skips events the editor already handled. |
| **Phones** | Checked at 390 px in the lab only, not on a device. |
| **Screen readers** | Covered by an automated axe scan, which found no critical issues; not tested with a real screen reader. |
