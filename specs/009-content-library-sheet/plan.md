# Implementation Plan: Content Library Sheet

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `009-content-library-sheet`) | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/009-content-library-sheet/spec.md`. The reference is the team's Content Library Google Sheet ("Plan (Organized)").

## Summary

A third view beside Board and the video Sheet: **Content**. It is the team's content plan as a dense grid.
- **Themes** are projects, carrying owner, frequency and audience.
- **Pillars** group pieces inside a theme.
- **Every piece is a task.** Each row shows its status in content words (Initial Design, Final Design…), with the board's move rules, plus four checked links: working doc, design, post and published.
- **Cadence:** each theme shows "this week 1 of 2".
- **Videos** expand into their clips.
- **Paste plan** brings the Google Sheet in: it matches rows that carry a Task Link instead of duplicating them, lists bad cells, and never stores a non-link.

Technical approach (details in [research.md](./research.md)):
- **Data (R1–R3):** themes are flagged projects with owner, frequency and audience; a new `ContentPillar` table; `tasks.pillar_id` and `post_url`; working doc and design are link attachments with a role.
- **Archive (R5):** spec 008's drop, widened to theme pieces.
- **Shared grid (R10):** spec 008's grid core is extracted and shared, guarded by its 68-check lab.
- **Paste plan (R8, R9):** a pure parser that understands merged cells, and a locked, idempotent server import.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router.

**Primary Dependencies**: Existing only: next-intl, Prisma v5, the spec 007/008 modules. No new dependency.

**Storage**: PostgreSQL via Prisma `db push`:
- `projects` gains theme fields;
- new `content_pillars` table;
- `tasks.pillar_id`, `tasks.post_url`;
- `task_attachments.link_role`.

The seed adds three content types and their SLA rows.

**Testing**: `npm run lab:sheet`, extended with a Content mode (Node checks and Playwright); `lab:attachments` and `lab:brief` as regressions; `typecheck`, `next build`; running-app checks with the 18 reference rows.

**Target Platform**: Desktop browsers first; usable on phones (grid scrolls inside its area). Deployed on Cranl.

**Project Type**: Web application (single Next.js project).

**Performance Goals**:
- At least 20 rows visible at 1366×768 (SC-006).
- 18 rows pasted and added in under 2 minutes end to end (SC-001); the server adds 300 rows in under 5 s.

**Constraints**:
- Content stage names are display labels only (§II).
- Adding pieces as a `user` is limited to themes they own or are assigned to (FR-052).
- Every link cell holds a web address or nothing (SC-005).
- Every colour comes from the token map (§I); every string exists in English and Arabic (FR-080).

**Scale/Scope**:
- Tens of themes, hundreds of pieces.
- 1 new view, 6 components, 4 pure modules, about 10 server actions.
- A grid core shared with spec 008; small changes to the board page query, `KanbanBoard` and the seed.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Gate | Status |
|---|---|---|
| **I. Design System Fidelity** | Token colours only. | **Pass.** Reuses `SHEET_UI` and `--sheet-*`. The lab's tokens-only check extends to `src/components/content/`. |
| **II. Workflow Pipeline Integrity** | No stage changes; SLA computed on render. | **Pass.** Content names are message strings. Archive is spec 008's drop flag. New content types get SLA rows, as the constitution asks of every type. |
| **III. Role-Based Feature Access** | Gates in UI and server; `user` = own tasks. | **Pass, with a sign-off.** Adding pieces as a `user` is limited to themes they own or are assigned to. They own what they add. New themes are admins' and superusers'. The New task form is unchanged. This exception is recorded for PR sign-off, like spec 008's clips. |
| **IV. Design-Driven Development** | Design file before UI. | **Pass, with a task.** `design/content-sheet.html` is committed before UI work, extending `design/video-sheet.html`. Plain HTML (the sign-off already asked for in specs 005, 007 and 008). |
| **V. Cultural UX** | Arabic strings; celebrations unchanged. | **Pass.** A `content` namespace in both languages. Moves use the board's move, so celebrations follow its rule. |
| **VI. State Architecture** | No persisted store state; unions in types first. | **Pass.** Nothing new in the store; the view is in the URL. `BoardView`, `FrequencyPeriod`, `AudienceKey` and `LinkRole` go in `src/types/index.ts` first. Show archived is a per-device preference (§VI 2.1.0). |
| **Tech Stack** | No new dependency. | **Pass.** |

No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/009-content-library-sheet/
├── plan.md · research.md (R1–R13) · data-model.md · quickstart.md
├── contracts/server.md · contracts/content-ui.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
design/content-sheet.html                       # NEW: approved design before UI work
prisma/schema.prisma                            # Project theme fields, ContentPillar, Task.pillar_id/post_url, TaskAttachment.link_role
prisma/seed.ts                                  # + Article, Report, Framework/Model with SLA rows
src/types/index.ts                              # BoardView + 'content', ContentTheme, FrequencyPeriod, AudienceKey, LinkRole
src/lib/mappers.ts                              # map pillar_id, post_url, link_role; mapTheme
src/actions/content.ts                          # NEW: addPlan, addPiece, updatePiece, setPieceLink, themes and pillars
src/actions/tasks.ts                            # dropTask/restoreTask (clip or theme piece); aliases kept
src/app/(app)/board/page.tsx                    # load themes and the new task fields
src/components/sheet/GridCore.tsx               # NEW: the grid core extracted from SheetGrid
src/components/sheet/SheetGrid.tsx              # becomes a model over GridCore
src/components/content/                         # NEW
├── ContentSheet.tsx · ContentGrid.tsx · ThemeEditor.tsx · PlanPreview.tsx
├── parse-plan.ts · rows.ts · summary.ts · cadence.ts · audience.ts
src/components/kanban/KanbanBoard.tsx           # Board | Sheet | Content; host calls
src/app/globals.css                             # .fx-content-* (spanning rows)
messages/en.json, messages/ar.json              # + "content" namespace
scripts/sheet-lab/                              # + content mode, fixtures, scenarios
```

**Structure Decision**: Same as spec 008. The shared grid core keeps the two sheets consistent. Content logic lives in its own folder with pure helpers.

## Phase 0 / Phase 1

Research R1–R13 in [research.md](./research.md). Design: [data-model.md](./data-model.md), [contracts/server.md](./contracts/server.md), [contracts/content-ui.md](./contracts/content-ui.md), [quickstart.md](./quickstart.md).

## Spec corrections (made with this plan)

- **Assumptions, "The reference"**: the older "Plan" tab has headings only for its first five columns. Paste plan reads it by column position, and reads "Plan (Organized)" by its headings.

## Constitution Check (post-design)

Holds as above. The grid-core refactor touches spec 008's components. Its full lab re-runs as a gate, so a regression in the video sheet fails the build of this feature.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| §III: `user`-level members add pieces to themes they own or are assigned to | The user's choice (FR-052, option A): theme owners run their own streams | Admins only would leave Samaa and Noran unable to add their own pieces; anyone-anywhere is broader than needed |
