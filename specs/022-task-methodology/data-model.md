# Data model: task methodology (022)

All schema changes are additive (`prisma db push`). Nothing is dropped.

## tasks (changed)

| Field | Type | Meaning |
|---|---|---|
| `media_board` | text, null | `'design'` / `'video'` for a media task; null for a content task. |
| `content_task_id` | uuid, null, FK → tasks.id (on delete: set null) | The content task a media task is linked to. Null: unlinked. |
| `entry_stage` | text, default `'todo'` | The stage the task began at; `'r-design'` for a task made on a media board. SLA reports skip stages before it. |
| `auto_linked_at` | timestamptz, null | On a content task: when the automatic link at Ready For Design ran. Set once, never cleared. |
| `migrated_simple` | boolean, default false | Set by the simple-task migration. Never celebrates; kept out of the brand Library and Calendar post markers. |
| `kind`, `simple_status` | unchanged columns | All `'pipeline'` / null after migration; no longer read. |

**Rules**
- A media task's `content_task_id` points at a task whose `media_board` is null (a content task).
- At most one linked media task per (content task, board): unique index on (`content_task_id`, `media_board`) where `content_task_id` is not null.
- A content task can be dropped while linked: its media tasks are unlinked (R4) in the same action.

**States of a media task**

```
created on board ──► unlinked, at Ready For Design ──► … ──► Published
auto / Link task ──► linked, Ready For Design ──► D-In Progress ──► D-Check ──passes──► follows content (F-Check … Published)
linked ──Unlink (any member)──► unlinked, at its current stage ──► … ──► Published
```

**Content task while linked**: stage = earliest stage among its linked media tasks that haven't passed D-Check; moves past D-Check refused until all have passed; then moved to F-Check by the server.

## team_spaces (changed)

| Field | Type | Meaning |
|---|---|---|
| `default_assignee_role` | text, null | The role new tasks made in this Space are assigned to. |
| `media_board` | text, null | `'design'` / `'video'`: this Space is that media board. |
| `default_kind`, `words` | unchanged columns | No longer read after migration. |

## content_types (changed)

| Field | Type | Meaning |
|---|---|---|
| `media_boards` | text[], default `{design}` | The boards a task of this type is linked to at Ready For Design. Video and Reel default to `{video}`. |

## space_stages (new)

| Field | Type | Meaning |
|---|---|---|
| `id` | uuid | |
| `space_id` | uuid FK → team_spaces (cascade) | |
| `stage_id` | text FK → stages | The original stage it maps to. |
| `name` | text, null | The Space's name; null shows the original name. |
| `position` | int | Order within its original stage (0 = first). |
| `aliases` | text[] | Other names that can be typed in sheets (from status words). |

**Validation (server, on save)**: every original stage of the pipeline has ≥ 1 row in the Space; names (and aliases) unique within the Space, ignoring case and spacing; a name may not equal another original stage's name; a row maps one stage.

## task_space_stages (new)

| Field | Type | Meaning |
|---|---|---|
| `task_id` | uuid FK → tasks (cascade) | |
| `space_id` | uuid FK → team_spaces (cascade) | |
| `space_stage_id` | uuid FK → space_stages (cascade) | |
| `stage_id` | text | The task's original stage when this was recorded. |

Primary key (`task_id`, `space_id`). A row counts only while `tasks.status = stage_id`; otherwise the task shows in the first Space stage of its current stage.

## task_spaces (rule change, same table)

- Rows with `added_via = 'assignee'` for the old assignee are deleted on an assignee change, unless the same Space also has a `created` or `manual` row.
- Design and Video Spaces never get `created_by_creator` or `assignee` rows for a content task.

## workspace_settings (unchanged)

The Due Dates weekend (`due_weekend_days`) is also the SLA weekend (R12).

## One-time migrations (`once()` in `prisma/seed.ts`)

| Key | Does |
|---|---|
| `simple-to-pipeline-v1` | s-todo → todo, s-doing → c-prog, s-done → publish; `kind='pipeline'`, `simple_status=null`, `migrated_simple=true`; `stage_date` = today for todo/c-prog. |
| `space-stages-v1` | One Space stage per Space per original stage, named from status words, other words as aliases. |
| `media-tasks-v1` | For content tasks at Ready For Design or later that show in Design/Video: one linked media task per board, same stage (or following, if past D-Check), current assignee; `auto_linked_at` set; their Design/Video `task_spaces` rows removed. |
| `space-default-roles-v1` | Content → Content Creator, Design → Graphic Designer, Video → Video Editor; Design/Video get `media_board`. |
| `content-type-boards-v1` | `media_boards` defaults per R6. |
| `due-dates-v1` | The 2026-11-23 due-date migration, moved here (R15); skipped if its workspace flag is already set. |
