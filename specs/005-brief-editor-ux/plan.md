# Implementation Plan: Brief Editor UX Overhaul

**Branch**: `005-brief-editor-ux` (developed on `claude/nice-noether-x4rgei`) | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-brief-editor-ux/spec.md`

## Summary

Fix the 23 problems the 2026-11-04 audit found in the brief editor, without changing how briefs are stored. Work splits into three bands that ship independently, in priority order:

1. **Stop losing or damaging work (P1)**: a save contract that reports failure, with retry and a guard against leaving; layered Esc; Clear format limited to the selection; Undo/Redo buttons; links that can be clicked, edited and removed and are saved with `https://`; image addresses checked before insert; screenshots pasted or dropped straight into the brief and stored as task attachments.
2. **Make it findable and reachable (P2)**: a "/" menu; keyboard-operable, screen-reader-labelled toolbar and menus; Task, YouTube, table, toggle and table-of-contents blocks that behave; a toolbar pinned in long briefs and on one row on phones; Arabic labels and right-to-left layout.
3. **Make editing and reading match (P3)**: underline survives Done, lists keep tight spacing, and the editor's colours come from the shared palette (closing the Constitution §I gap).

Technical approach, in one line each (decisions in [research.md](./research.md)):

- Everything stays in `BriefEditor.tsx`, split into small co-located modules under `src/components/kanban/brief-editor/`. The Markdown storage format is unchanged.
- New blocks (YouTube, table of contents) are editor-only node types that read and write the *same Markdown the read view already understands*. Old briefs parse into them; new briefs stay readable by `Brief.tsx`.
- The parent ↔ editor boundary gets two explicit contracts: `onSave` resolves to success or failure and never hangs, and `onUploadImages` uploads files and returns their addresses. See [contracts/brief-editor-props.md](./contracts/brief-editor-props.md).
- One new package, `@tiptap/suggestion@3.31.3`, for the "/" menu. It is the official sub-package of the Tiptap version already installed.

## Technical Context

**Language/Version**: TypeScript 5.8 (strict), React 19, Next.js 16 App Router

**Primary Dependencies**: Tiptap 3.31.3 (`@tiptap/react`, `starter-kit`, `extension-table`, `extension-task-*`, `extension-image`, `extension-placeholder`), `tiptap-markdown` 0.9.0, `next-intl`. New: `@tiptap/suggestion` 3.31.3 (runtime); `axe-core` (dev only, lab accessibility scan).

**Storage**: Brief text in `tasks.description` (Markdown, unchanged). Pasted images go to the existing object-storage bucket through the existing `POST /api/attachments/[ref]` route and become `task_attachments` rows. No schema change.

**Testing**: The repo has no test runner (constitution: "none mandated yet"). Validation is `npm run typecheck`, `npm run lint`, and a Playwright script that drives the real editor in a standalone page. That is the harness used for the audit, committed under `scripts/brief-editor-lab/`; see [quickstart.md](./quickstart.md).

**Target Platform**: Modern evergreen browsers, desktop and phone (390px), Arabic (RTL) and English (LTR).

**Project Type**: Web application (single Next.js project).

**Performance Goals**: Typing stays responsive with briefs up to ~5,000 words; a pasted screenshot ≤ 5 MB appears in place in < 5 s (SC-003); the "/" menu opens within one frame of the keystroke.

**Constraints**:
- The storage format must round-trip. Any brief saved by the new editor must render identically in `Brief.tsx`, and every existing brief must open unchanged (FR-100, SC-010).
- No `window.confirm`/`alert`; confirmations are in-editor UI.
- Pasted images upload only when the deployment has object storage (`storageConfigured()`); production does.
- The editor appears in two hosts, `TaskModal` (has a task) and `TaskForm` (no task yet).

**Scale/Scope**: One component (718 lines today) plus small edits to `TaskModal.tsx`, `TaskForm.tsx`, `Brief.tsx`, `globals.css`, `tokens.ts`, `messages/{en,ar}.json`, `src/lib/links.ts`. 7 users.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Applies? | Status | Notes |
|---|---|---|---|
| §I Design System Fidelity: no colour literals outside the token map | Yes | **PASS (after fix)** | Today the editor violates this (`BR` palette, audit E23). The plan moves the blue + lime UI palette into `src/lib/tokens.ts` as `BRIEF_UI` and the editor imports it (FR-082). `TaskModal`'s `CU` and `TaskForm`'s `CU` carry the same literals. They are out of this spec's scope, but they can switch to the same tokens in a follow-up. Typography stays Inter for body, Montserrat for brief headings via `--font-heading`. |
| §II Workflow Pipeline Integrity | No | N/A | No stage, SLA or ownership change. |
| §III Role-Based Feature Access: UI MUST conditionally render, not rely on API checks alone | Yes | **PASS** | Image paste/drop is offered only when the host passes `onUploadImages`, which `TaskModal` passes only when `canEdit && hasStorage`. The server route keeps its existing `mayAttachTo` guard. |
| §IV Design-Driven Development: a standalone HTML design file MUST precede new views or major components | Yes | **PASS (conditional)** | The link card, "/" menu, table menu and reworked toolbar are new UI. Task **T001** produces `design/brief-editor-ux.html` (toolbar desktop + phone, link card, "/" menu, table menu, save-failure state, Arabic) and is a hard prerequisite for every UI task. |
| §V Cultural UX: Arabic copy as content data | Yes | **PASS** | All editor strings move to a `briefEditor` namespace in `messages/en.json` and `messages/ar.json` (FR-090). |
| §VI State Architecture: no persisted client state, no new Zustand keys | Yes | **PASS** | Save state and overlays are local component state; nothing is persisted client-side. |
| Tech Stack: adding a *major* dependency needs an amendment | Yes | **PASS** | `@tiptap/suggestion` is a sub-package of the already-adopted Tiptap at the same pinned version, not a new major dependency. Recorded in research R6. |

No unjustified violations. Complexity Tracking is empty.

*Note for the team*: the constitution's Tech Stack and §III/§VI still describe Supabase, RLS and Vercel, which `HANDOVER.md` §3 records as replaced. That drift predates this feature and is not changed here.

### Post-design re-check

After Phase 1 every row above still holds. The design adds two editor-only node types (YouTube, table of contents) whose Markdown matches what `Brief.tsx` already renders, one prop pair to the editor ([contract](./contracts/brief-editor-props.md)), an optional return value on the upload path, and no database or state-shape changes. **Gate: PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/005-brief-editor-ux/
├── spec.md
├── plan.md                         # this file
├── research.md                     # Phase 0 decisions R1–R24
├── data-model.md                   # Phase 1: document model, save state, upload jobs
├── quickstart.md                   # Phase 1: how to validate end to end
├── contracts/
│   ├── brief-editor-props.md       # host ↔ editor interface (onSave, onUploadImages, …)
│   ├── markdown-storage.md         # what each block reads and writes
│   └── keyboard-and-a11y.md        # shortcuts, Esc layering, ARIA roles
├── checklists/requirements.md
└── tasks.md                        # Phase 2 (/speckit-tasks), not created here
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── kanban/
│   │   ├── BriefEditor.tsx                 # slimmed: composition, save pump, layout
│   │   ├── brief-editor/                   # NEW, co-located modules
│   │   │   ├── extensions.ts               # Toggle, Youtube, Toc, LinkShortcut, SlashCommand config
│   │   │   ├── useSaveQueue.ts             # save contract: queue, retry, state (R1)
│   │   │   ├── useOverlayStack.ts          # Esc layering (R2)
│   │   │   ├── imageUpload.ts              # paste/drop → placeholder decorations → insert (R5)
│   │   │   ├── Toolbar.tsx                 # role=toolbar, sticky, phone row (R13, R14, R16)
│   │   │   ├── Menu.tsx                    # roving-focus menu used by all dropdowns (R16)
│   │   │   ├── LinkCard.tsx                # Open · Edit · Remove (R3)
│   │   │   ├── TableMenu.tsx               # row/column/table actions (R10)
│   │   │   ├── SlashMenu.tsx               # "/" menu list (R6)
│   │   │   └── ValuePrompt.tsx             # link/image/YouTube/subtask box with validation (R3, R4, R8)
│   │   └── TaskModal.tsx                   # applyPatch → boolean; onUploadImages; window drop yields
│   └── shared/
│       ├── Brief.tsx                       # allow <u> (R15)
│       └── TaskForm.tsx                    # onSave returns true; no onUploadImages (R22)
├── lib/
│   ├── links.ts                            # normaliseUrl() (R3)
│   └── tokens.ts                           # BRIEF_UI palette (R17)
├── app/globals.css                         # list spacing, editor table width, placeholders (R10, R11, R15)
messages/en.json, messages/ar.json          # briefEditor namespace (R18)
scripts/brief-editor-lab/                   # Playwright harness + scenarios (R24)
design/brief-editor-ux.html                 # §IV design file (T001)
```

**Structure Decision**: Single Next.js project; the editor stays one public component (`BriefEditor`) with an unchanged import path, so both hosts keep working. Internals move into `src/components/kanban/brief-editor/` because the file would otherwise grow past ~1,500 lines. No new routes, no server actions beyond a widened return type.

## Delivery order

Each band is a releasable increment, mirroring the spec's priorities.

| Band | Stories | Key requirements | Depends on |
|---|---|---|---|
| 0. Foundations | n/a | T001 design file; token palette; i18n namespace scaffold; lab harness | none |
| 1. Trust (P1) | US1, US4, US2, US3 | FR-001–005, 010–013, 020–025, 030–036 | Band 0 |
| 2. Reach (P2) | US5, US6, US7, US8 | FR-040–047, 060–066, 070–071, 090–091 | Band 1's `Menu` and overlay stack |
| 3. Match (P3) | US9 | FR-080–082 | none (can run in parallel with Band 2) |

## Complexity Tracking

No constitution violations to justify.
