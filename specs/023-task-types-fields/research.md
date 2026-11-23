# Research: Task Types and Fields

> **2026-11-23 — gates.** The user said "continue until you finish": that is the go for T001 (spec 022 treated as shipped on this branch) and for building each stage without stopping at the design gates. The designs are still published for review — Stage A: https://claude.ai/artifact/6jNNspCsA5Ek33WoQkv7c9 (`design/023-stage-a.html`) — and any change the user asks for is applied afterwards.

Decisions behind the plan. User decisions (D1–D18, Milestone, D14) are recorded in `design/task-fields-methodology.html`; the items below settle how to build them.

## R1. Task types are the content types, extended
- **Decision**: keep `content_types` as the task type table. `label` stays the English name and the key (tasks, SLA rows and the media boards already reference it, and renaming cascades). Add `name_ar`, `icon`, `color`, `default_priority`, `default_tag_ids`, `default_template_id` (Stage D), `position`.
- **Rationale**: no task changes type or loses SLA; the cascade already exists.
- **Alternatives**: a new `task_types` table with ids (needs every task, SLA row and board mapping migrated); rejected.
- Icons: a fixed set of about 24 line icons drawn in the app (no uploads), stored by name.

## R2. Fields live in a workspace library; values belong to the task
- **Decision**: `task_fields` (library), `task_type_fields` (attachment: required-from stage, default, order), `task_field_values` (one row per task and field, value as JSON validated by kind).
- **Rationale**: one value per task, shown in every place (FR-007). JSON keeps eleven kinds in one table; the pure `task-fields.ts` validates and formats each kind.
- **Alternatives**: a column per kind (sparse, rigid); reusing `sheet_values` (per sheet, the problem we're solving).
- Kinds: text, number, money (amount + currency from the sheet currencies), date, link, person, choice, multi-choice, checkbox, rating (1–5), related task.

## R3. Task fields in sheets
- **Decision**: every sheet whose rows are tasks (Content, Video, task sheets of Spaces, brands, My tasks) offers each live field as a column with key `f:<fieldId>`. It's shown by default when any row's type has the field, and can be hidden or moved like any column. A row whose type lacks the field shows a hatched, read-only cell (as switched-off brand features do today).
- Editing a cell writes `task_field_values` through the same per-cell save path, so undo, paste and fill work.
- **Make it a task field** (D5): on a custom column of a task sheet, an admin or superuser converts it. The field is created with the column's name, kind and options; each value moves from `sheet_values` (keyed by task) to `task_field_values`; the sheet's layout swaps the column key for `f:<id>`. Blank sheets (rows aren't tasks) don't offer it.

## R4. "Required from stage" joins the one move gate
- **Decision**: a pure `missingRequired(task, typeFields, values, target)` returns the empty required fields whose stage is at or before `target` on the task's path. It runs in the same gate as `mediaGate` for every move: `setTaskStage`, `moveTask`, bulk, the sheet and the board (all call these), and `moveThroughMedia` (a linked row's move).
- Automatic moves: when media tasks pass D-Check and the content task would go to F-Check, a missing required field keeps the content task where it is; the row and the card say "Waiting for Caption". The media task's own move isn't blocked.
- Message: "Caption is required before C-Review" (several fields: "Caption and Hashtags are required before C-Review"), in the Space's stage names where shown.
- **Alternatives**: check only in the UI (leaves bulk and sync open; violates §II).

## R5. Status groups
- **Decision**: a pure map: To Do → Not started; C-In Progress, C-Review, C-Check, Ready For Design, D-In Progress, D-Check, F-Check → Active; Ready to Publish, Scheduled → Done; Published → Closed. Used by filters, list group-by and reports; Space stages inherit their original stage's group.

## R6. Milestones are calendar markers
- **Decision**: `milestones` (name, day, brand_id, created_by). Shown as a flag chip on a day in the brand's calendar, in Space calendars when the Space has work for that brand in view, and in My tasks' calendar. Not draggable into a stage; admins and superusers add, rename, move and delete (D, Milestone decision).

## R7. Priorities
- **Decision**: `Priority = 'Urgent' | 'High' | 'Normal' | 'Low' | 'None'`; the column keeps its name; default `Normal`. `once('priority-normal-v1')` turns Medium into Normal. Sheets and typing accept English and Arabic names.
- Urgent sorts first: every default sort gets "Urgent first" as its first key; a chosen sort (due date, name…) is kept after it.
- Setting Urgent notifies each assignee through a new notification kind `urgent` (push on by default, as `mention`).

## R8. Tags
- **Decision**: `tags` (name unique ignoring case and spaces, colour from a palette of 10) and `task_tags`. Anyone tagging may create a tag; admins rename, merge (move every task's link to the kept tag, once each) and delete. A new brand feature switch `tags`.
- Shown on cards (up to 3, then +N), in the panel, as a sheet column `tags`, in filters (any/all) and list group-by.

## R9. Several assignees, first is lead
- **Decision**: `task_assignees` (task_id, member_id, position, hours). `tasks.assignee_id` stays and always equals position 0 (the lead), so SLA, alerts, Shows in and every filter keep working. `once('assignees-v1')` writes today's assignee as the lead.
- My tasks and "Mine" filters include tasks where the member is any assignee. `allowedStages`: a working stage is held by the owner or any assignee (constitution §II amendment).
- Shows in follows the lead only (D12); changing the lead calls `changeAssigneeSpaces` (spec 022).
- Workload: hours split evenly, or each assignee's `hours` when set.

## R10. Start dates
- **Decision**: `tasks.start_date` (date, nullable). Saved only when start ≤ due (when a due date exists). Calendar gets a "Spans" toggle (per device). Workload spreads `hours / working days in [start, due]` on the Settings weekend; without a start it stays on the due day.

## R11. Templates
- **Decision**: `task_templates` (type, name, name_pattern, brief, values JSON: fields, priority, tags, assignee_role, project; subtasks JSON: name, start offset, due offset, assignee_role, fields). Placeholders `{Brand}`, `{Month}`, `{Date}`, `{Type}`.
- Creating from a template uses `createTask` for the task and each subtask (parent_task_id), so every rule (defaults, Shows in, due-date rule, notifications) applies. Dates: offsets in calendar days from the publishing date. Missing role holder → the creator (as spec 022's default role).

## R12. Recurring tasks
- **Decision**: `repeat_rules` (source task or template, frequency days | weeks | monthly, interval, weekdays, month_day, ends_on, max_count, lead_working_days, next_publish, made_count, skip_next, stopped_at). A scheduler job (hourly, in `src/lib/notify/scheduler.ts`) creates each occurrence whose creation day has come.
- Creation day = the occurrence's due date (by the due-date rule) minus `lead_working_days` working days. Minimum `lead_working_days` = the type's total SLA working days; the default is that minimum; saving less is refused with the minimum named. This satisfies D17 (lead time ≥ due-date offset + SLA working days, counted from the publishing date).
- Exactly once: `tasks.recurrence_key = '<ruleId>:<publishDate>'`, unique; a missed day creates each missed occurrence once.

## R13. Standing projects
- **Decision**: recurring tasks keep the series' `project_id`, so the project's period counts already include them; no new counting.

## R14. Order and gate
- **Decision**: Stage A starts after the user confirms spec 022 has shipped. Each stage ends with a stop for review, as specs 021–022 did.
