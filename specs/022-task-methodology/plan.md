# Implementation Plan: Task methodology — one pipeline, media links, Space stages

**Branch**: `claude/wonderful-dirac-k1wflu` (folder `022-task-methodology`) | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

**Input**: the user's decisions of 2026-11-23 and [spec.md](./spec.md).

## Summary

Every task becomes a pipeline task (11 stages, 10 without C-Check), taking its Space's default assignee role. Design and Video become media boards holding *media tasks*: linked to a content task (automatically once at Ready For Design, or by hand with Link task) or unlinked (Create task on the board, or after an Unlink, which anyone may do). A content task linked to several boards waits until every media task passes D-Check, then moves to F-Check. Status words become real Space stages that can rename or split an original stage, with per-Space sub-stage moves that change nothing else. Simple tasks are removed and migrated. SLA counts Sunday–Thursday on Cairo days. The task-to-task field is renamed Related task.

Technical approach (research.md): a media task is its own task row (R1); the content task's stage is derived and gated inside the one move rule (R2); Space stages and sub-stage positions live in two new tables (R7); every data change runs once from `prisma/seed.ts` (R15).

## Technical Context

**Language/Version**: TypeScript (strict), Node 22

**Primary Dependencies**: Next.js 16 App Router, server actions, Prisma 5 (pinned), next-intl, Zustand (UI only), @dnd-kit. No new dependency.

**Storage**: PostgreSQL; additive schema via `prisma db push`; one-time data changes via `once()` in `prisma/seed.ts`.

**Testing**: `npm run typecheck`; `lab:spaces` (pure checks in Node); real-app Playwright scenarios (`scripts/spaces-lab/realapp`); `lab:sheet`, `lab:inbox`, `lab:notify`, `lab:spreadsheet` for regression.

**Target Platform**: web (desktop first, phone layouts kept), deployed on Cranl from `main`.

**Project Type**: web application (single Next.js app).

**Performance Goals**: board load unchanged (one query per table, never per task); the media gate and Space stage lookups are in-memory maps over data already loaded.

**Constraints**: no column dropped on the live database; Arabic + English with RTL; nothing merged to `main` until launch.

**Scale/Scope**: ~400 tasks, 4 brands, 4–6 Spaces, 11 stages; ~25 files changed, 5 new.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Design system fidelity | ✅ | Tokens only; no new colours (media chips use stage colours). |
| II. Workflow integrity | ⚠️ needs amendment | Removes the simple-task workflow; adds media tasks and the "waiting on media" gate to `allowedStages`; SLA days become Sunday–Thursday (Settings weekend). The amendment (constitution 4.0.0, MAJOR) is the first task, as spec 021 did with 3.0.0. All moves stay inside `allowedStages`. |
| III. Role-based access | ✅ | Unlink (any member, user 2026-11-23), Space stages (admin, superuser), default role and content-type boards (admin) are checked in their server actions. |
| IV. Design-driven development | ⏳ gate | `design/task-methodology.html` (hand-off box per board, media board actions, media chips, Space stages settings) must be approved before Phases 4–5 UI. |
| V. Celebration system | ⚠️ amendment | The simple-task celebration rule goes; migrated tasks never celebrate. Pipeline celebration unchanged, including for media tasks. |
| VI. State architecture | ✅ | Postgres for Space stages and sub-stage positions (shared); `once()` for data changes (R15 also moves the due-date migration there); `MediaBoard` union added to `src/types/index.ts`; `TaskKind`/`SimpleStatus` left unused, then removed. |
| Tech stack | ✅ | No change. The note "reorder within a column" is corrected (reorder is off since the due-date sort). |

**Post-design re-check**: unchanged. Data model and contracts keep every move in `allowedStages`, every permission in its action, and every shared preference in Postgres. II and V pass once the amendment lands; IV passes once the design file is approved.

## Project Structure

### Documentation (this feature)

```text
specs/022-task-methodology/
├── plan.md              # This file
├── spec.md              # Requirements from the decisions
├── research.md          # R1–R18
├── data-model.md        # Tables, fields, rules, migrations
├── quickstart.md        # Validation scenarios
├── contracts/
│   ├── server-actions.md
│   └── ui.md
└── tasks.md             # Next: /speckit-tasks
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                 # tasks, team_spaces, content_types fields; space_stages, task_space_stages
└── seed.ts                       # once(): simple-to-pipeline, space-stages, media-tasks, default roles, type boards, due-dates
src/
├── actions/
│   ├── media.ts                  # NEW: linkToMedia, createMediaTask, unlinkMedia
│   ├── space-stages.ts           # NEW: saveSpaceStages, moveSubStage
│   ├── tasks.ts                  # moveTask gate + auto link, createTask default assignee, assignee Shows-in rule
│   ├── spaces.ts                 # default_assignee_role
│   ├── settings.ts               # setContentTypeBoards
│   └── sheet-columns.ts          # revert "link makes pipeline"; Related task wording
├── lib/
│   ├── media.ts                  # NEW, pure: content stage from media tasks, gate, boards for a type
│   ├── space-stages.ts           # NEW, pure: mapping validation, sub-stage resolution, Space stage words for sheets
│   ├── stage-moves.ts            # allowedStages: waiting_on_media, follows_content
│   ├── spaces.ts / spaces-server.ts  # Shows-in rules; remove kind paths
│   ├── utils.ts                  # businessDaysBetween on Cairo days with the Settings weekend
│   └── alert-status.ts           # entry_stage
├── components/
│   ├── handoff/                  # one person picker per board
│   ├── views/ (BoardView, SpacePage, ListView, TaskSheet, CalendarView)  # Space stages
│   ├── kanban/ (KanbanBoard, KanbanColumn, TaskCard, TaskModal, TaskForm) # media chips, Unlink, remove simple
│   ├── spaces/SpaceStages.tsx    # NEW (replaces SpaceWords.tsx)
│   ├── media/MediaActions.tsx    # NEW: Link task / Create task
│   └── settings/ (SpacesSettings, WorkflowSettings)
├── types/index.ts                # MediaBoard
└── messages/{en,ar}.json
design/task-methodology.html      # NEW, for approval (§IV)
scripts/spaces-lab/               # pure checks + realapp scenarios-022*.cjs
.specify/memory/constitution.md   # 4.0.0
```

**Structure Decision**: the existing single Next.js app layout (constitution "Source layout"); two new action files and two new pure libs, everything else is a change in place.

## Phases

| # | Phase | Ends with |
|---|---|---|
| 0 | Constitution 4.0.0; `design/task-methodology.html`; **user approval** of design and of R10–R14 defaults | approved design |
| 1 | Remove simple tasks; revert `4fcbc23`; migration `simple-to-pipeline-v1` | quickstart 1 |
| 2 | SLA Sunday–Thursday on Cairo days (Settings weekend); `entry_stage` | quickstart 13 |
| 3 | Default assignee role; Shows-in rules; content-type boards setting | quickstart 2, 9, 10 |
| 4 | Media tasks: schema, `lib/media.ts`, move gate, auto link + box, Link task / Create task / Unlink, chips; migration `media-tasks-v1` | quickstart 4–8 |
| 5 | Space stages: tables, `lib/space-stages.ts`, settings UI, views and sheets, sub-stage moves; migration `space-stages-v1`; retire status words | quickstart 11–12 |
| 6 | Related task rename; due-dates migration into `once()` | quickstart 14 |
| 7 | Arabic review, full regression, HANDOVER note | regression green |

Phases 1–3 are independent of each other. 4 needs 1. 5 needs 1 and can run beside 4.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| §II redefined (one workflow; media gate in `allowedStages`; Settings weekend for SLA) | The user's methodology (2026-11-23) | Keeping simple tasks or a separate media workflow would contradict "every task is a pipeline task". |
| §V simple-task celebration removed | No simple tasks remain | — |
| Two new tables (Space stages, sub-stage positions) | Splits and "remember only while in that stage" need storage per Space and per task | JSON on `team_spaces` can't hold per-task positions; a column per Space on `tasks` doesn't scale with Spaces. |
