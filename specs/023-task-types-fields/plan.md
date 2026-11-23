# Implementation Plan: Task Types and Fields

**Branch**: `claude/wonderful-dirac-k1wflu` (spec folder `023-task-types-fields`) | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/023-task-types-fields/spec.md`, built on the approved methodology `design/task-fields-methodology.html` (decisions D1–D18, Milestone, D14, recorded 2026-11-23).

## Summary

The ClickUp task model, built on Momentum's one pipeline in four stages, each reviewed before the next:

| Stage | What ships | Stories |
|---|---|---|
| **Gate** | Spec 022 shipped and tested (user decision). On this branch spec 022 is complete and green; Stage A starts when the user confirms it has shipped. | — |
| **A** | Content types become task types (names EN/AR, icon, colour, defaults); a workspace field library attached to types with "Required from stage"; field values on the task everywhere; "Make it a task field"; status groups; milestones on calendars. | US1–US3 |
| **B** | Urgent/High/Normal/Low/No priority; workspace tags; several assignees with a lead. | US4–US5 |
| **C** | Optional start dates; calendar spans; workload over the span. | US6 |
| **D** | Task templates per type; recurring tasks created ahead of their publishing date. | US7–US8 |

The technical approach keeps every existing reader working: the task keeps `assignee_id` as the lead, `content_type_label` as the type's key and `priority` as one column, and the new data sits beside them (field values, tags, assignments, templates, repeat rules). The required-field rule joins the media gate in the one move path, so no screen gets a second way around it (constitution §II).

## Technical Context

**Language/Version**: TypeScript 5, Node 22
**Primary Dependencies**: Next.js 16 (App Router, server actions), Prisma 5, next-intl (en/ar), Zustand (UI ephemera only)
**Storage**: PostgreSQL (`prisma db push`; one-time data changes as `once()` steps in `prisma/seed.ts`)
**Testing**: `npx tsc --noEmit`; pure checks in `scripts/spaces-lab/pure.mjs`; real-app Playwright scenarios in `scripts/spaces-lab/realapp/`; `lab:sheet`, `lab:spreadsheet`, `lab:notify`, `lab:inbox`, `lab:hours`; axe via `scripts/spaces-lab/realapp/axe-022.cjs`
**Target Platform**: Web (desktop and phone), deployed on Cranl
**Project Type**: Web application (one Next.js app)
**Performance Goals**: Boards, sheets and calendars with types, fields, tags and assignees open as today: first screen under 2 s with 5,000 tasks (SC-006); field values loaded as one flat array beside the tasks, never a query per task
**Constraints**: Africa/Cairo days, dates only; every server action checks its own permission (constitution §III); everything new in English and Arabic; brand feature switches hide fields and tags per brand
**Scale/Scope**: ~5,000 tasks, ~15 members, ~10 task types, tens of fields, hundreds of tags

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan complies | Status |
|---|---|---|
| §I Design System Fidelity | New screens (Task types, Fields, Tags, Templates, Repeat) are designed and approved before they're built (T-gates per stage), on Momentum's tokens. | Pass |
| §II Workflow Integrity | The pipeline is unchanged; no stage skipping (D1/D2 postponed); no free statuses (D6). Required fields add a refusal inside the existing move gate used by every path (R4). Milestones are not tasks. **Amendment needed** (MINOR, 4.1.0): working stages belong to "any assignee" (not "the assignee"), and the move rule also refuses a stage while a required field is empty. | Pass with amendment (Stage A task 1, Stage B task 1) |
| §III Role-Based Access | Fields, type settings, templates, tag rename/merge/delete: admins and superusers (types: admins); everyone uses them and creates tags. Each enforced in its server action. | Pass |
| §IV Design-Driven Development | Each stage opens with its design file for approval (T-gate), as in specs 021–022. | Pass |
| §V Cultural UX | Arabic names for types and fields; celebrations unchanged; Urgent reuses the existing notification channels. | Pass |
| §VI State & Persistence | All shared data in Postgres; per-device preferences only for view toggles (calendar spans). `Priority` union changes in `src/types/index.ts` first. Data changes via `once()`: `task-types-v1`, `priority-normal-v1`, `assignees-v1`. **Amendment**: task types become data (the `ContentType` record gains names, icon and colour). | Pass with amendment |

No unjustified violations. Post-design re-check: Pass (see end).

## Project Structure

### Documentation (this feature)

```text
specs/023-task-types-fields/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R14
├── data-model.md        # Phase 1: tables and rules
├── quickstart.md        # Phase 1: checks per stage
├── contracts/
│   ├── server-actions.md
│   └── ui.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                 # content_types + names/icon/colour/defaults; task_fields, task_type_fields,
│                                 # task_field_values, milestones (A); tags, task_tags, task_assignees (B);
│                                 # tasks.start_date (C); task_templates, repeat_rules, tasks.recurrence_key (D)
└── seed.ts                       # once(): task-types-v1, priority-normal-v1, assignees-v1

src/lib/
├── task-types.ts                 # pure: icons list, defaults for a new task
├── task-fields.ts                # pure: kinds, value parse/format, missingRequired(), cell applicability
├── status-groups.ts              # pure: stage → Not started / Active / Done / Closed
├── tags.ts                       # pure: name normalising, merge planning
├── assignees.ts                  # pure: lead, workload split
├── templates.ts                  # pure: name pattern, relative dates
├── recurrence.ts                 # pure: next occurrence, minimum lead time, creation day
├── stage-moves.ts                # allowedStages: any assignee holds working stages (B)
├── media-server.ts               # gates: required fields beside mediaGate (A)
└── notify/scheduler.ts           # recurring creation job (D)

src/actions/
├── task-types.ts  task-fields.ts  milestones.ts        (A)
├── tags.ts  (tasks.ts: priority, assignees)            (B)
├── tasks.ts (start_date)                               (C)
└── templates.ts  recurrence.ts                         (D)

src/components/
├── settings/TaskTypesSettings.tsx  FieldsSettings.tsx  TagsSettings.tsx  TemplatesSettings.tsx
├── fields/FieldCell.tsx  FieldEditor.tsx  FieldsSection.tsx   # one editor for panel, sheets, cards
├── tags/TagPicker.tsx  TagChips.tsx
├── people/AssigneesPicker.tsx
├── views/CalendarView.tsx       # milestones, spans
├── kanban/TaskCard.tsx  TaskModal.tsx  BoardFilters.tsx
├── sheet/useSheetColumns.tsx    # task fields as `f:<id>` columns in every task sheet
└── templates/NewFromTemplate.tsx  RepeatEditor.tsx

scripts/spaces-lab/
├── pure.mjs                      # pure checks per stage
└── realapp/scenarios-023-{a,b,c,d}.cjs
```

**Structure Decision**: one Next.js app, as today. Pure rules in `src/lib/*` (checked by the lab), writes in `src/actions/*` (each with its own permission check), screens in `src/components/*`.

## Phases inside each stage

Each stage follows the same order, ending with a review stop:

1. **Gate**: design file for the stage's new screens (`design/023-stage-X.html`), approved by the user.
2. **Model**: schema, mappers, types, `once()` data change.
3. **Rules**: pure helpers + lab checks.
4. **Writes**: server actions with permission checks.
5. **Screens**: Settings, task panel, cards, sheets, calendar, filters.
6. **Tests**: real-app scenarios for the stage's stories; full regression; Arabic and phone axe.
7. **Stop**: report, previews, wait for the user's go before the next stage.

## Complexity Tracking

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| Keep `tasks.assignee_id` as the lead next to `task_assignees` | Every reader (SLA, alerts, Shows in, Inbox, filters, sheets) uses it today | Replacing it everywhere at once risks the whole app for one feature |
| Field values in their own table, not in `sheet_values` | Values belong to the task, shown in every sheet (FR-007) | `sheet_values` is per sheet; reusing it would keep values apart |
| Required fields checked in the shared move gate | One move rule (§II) | A check in each screen would leave paths open (bulk, linked sync) |

## Post-design Constitution Check

Re-checked after `research.md`, `data-model.md` and the contracts: still Pass. The two amendments (§II any assignee and required-field refusal; §VI task types as data and the Priority union) are the first task of Stages A and B.
