# Data Model: Task Types and Fields

All new tables are workspace-wide. Every write goes through a server action with its own permission check (constitution §III). Changes to existing rows run once through `prisma/seed.ts` `once()`.

## Stage A

### content_types (task types) — extended
| Field | Type | Meaning |
|---|---|---|
| `label` | text, unique | English name and key (unchanged; renames cascade to tasks and SLA). |
| `name_ar` | text, null | Arabic name; null shows the English. |
| `icon` | text | One of the app's fixed icon names. |
| `color` | text | `#RRGGBB` from the palette. |
| `default_priority` | text, null | A `Priority`; null = Normal. |
| `default_tag_ids` | uuid[] | Tags a new task of this type gets (Stage B). |
| `default_template_id` | uuid, null | Stage D. |
| `position` | int | Order in menus. |
| `media_boards` | text[] | Unchanged (spec 022). |

`once('task-types-v1')`: give each existing type an icon and colour by its label (Post, Carousel, Story, Reel, Video…), `name_ar` from today's translations.

### task_fields (library)
| Field | Type | Meaning |
|---|---|---|
| `id` | uuid | |
| `name_en`, `name_ar` | text | Unique among live fields, ignoring case and spacing. |
| `kind` | text | text, number, money, date, link, person, choice, multi, checkbox, rating, task. |
| `options` | JSON | Choice options `{id, name_en, name_ar, color}[]`; money currency; rating max (5). |
| `on_card` | bool | Show on cards. |
| `switchable` | bool | A brand feature switch can hide it. |
| `retired_at` | timestamptz, null | Retired fields keep values but don't show. |

### task_type_fields (attachment)
| Field | Type | Meaning |
|---|---|---|
| `type_label` | text FK → content_types.label (cascade) | |
| `field_id` | uuid FK → task_fields | |
| `required_from` | text, null | A pipeline stage id; null = optional. |
| `default_value` | JSON, null | Validated like a value. |
| `position` | int | Order in the panel. |
PK (`type_label`, `field_id`).

### task_field_values
| Field | Type | Meaning |
|---|---|---|
| `task_id` | uuid FK → tasks (cascade) | |
| `field_id` | uuid FK → task_fields | |
| `value` | JSON | Validated by kind (`src/lib/task-fields.ts`). |
| `updated_by`, `updated_at` | | |
PK (`task_id`, `field_id`). A value is kept when its field is detached or the task changes type (hidden, comes back on re-attach).

**Rule (FR-008)**: a move to stage *S* is refused while any field attached to the task's type with `required_from` at or before *S* on the task's path is empty.

### milestones
| Field | Type | Meaning |
|---|---|---|
| `id` | uuid | |
| `brand_id` | uuid FK → brands (cascade) | |
| `name` | text (≤ 80) | |
| `day` | date | A Cairo day. |
| `created_by`, `created_at` | | |

## Stage B

### tasks.priority — values
`Urgent | High | Normal | Low | None`. `once('priority-normal-v1')`: `Medium → Normal`; default becomes `Normal`.

### tags, task_tags
| tags | Type | | task_tags | Type |
|---|---|---|---|---|
| `id` | uuid | | `task_id` | uuid FK (cascade) |
| `name` | text, unique ignoring case and spacing | | `tag_id` | uuid FK (cascade) |
| `color` | text | | PK (`task_id`, `tag_id`) | |
| `created_by`, `created_at` | | | | |

Merge: every `task_tags` row of the merged tag moves to the kept tag (skipping duplicates), then the merged tag is deleted.

### task_assignees
| Field | Type | Meaning |
|---|---|---|
| `task_id` | uuid FK (cascade) | |
| `member_id` | uuid FK | |
| `position` | int | 0 = lead. |
| `hours` | numeric, null | This person's hours; null = an even share. |
PK (`task_id`, `member_id`). **Invariant**: `tasks.assignee_id` = the member at position 0. `once('assignees-v1')` writes each task's assignee at position 0.

## Stage C

### tasks.start_date
`date`, null. **Rule**: when both are set, `start_date ≤ due_date`.

## Stage D

### task_templates
| Field | Type | Meaning |
|---|---|---|
| `id` | uuid | |
| `type_label` | text FK → content_types.label (cascade) | |
| `name` | text | The template's own name. |
| `name_pattern` | text | With `{Brand}`, `{Month}`, `{Date}`, `{Type}`. |
| `brief` | text | |
| `values` | JSON | `{ fields: {fieldId: value}, priority, tagIds, assigneeRole, projectId }` |
| `subtasks` | JSON | `[{ name, startOffset, dueOffset, assigneeRole, fields }]`, offsets in days from the publishing date (negative = before). |
| `created_by`, `updated_at` | | |

Editing changes new tasks only; tasks keep no link that would update them.

### repeat_rules
| Field | Type | Meaning |
|---|---|---|
| `id` | uuid | |
| `source_task_id` | uuid, null | The task the series copies (its latest occurrence). |
| `template_id` | uuid, null | Or a template. One of the two is set. |
| `brand_id`, `project_id`, `space_id` | | Where new occurrences go. |
| `freq` | text | `days`, `weeks`, `monthly`. |
| `interval` | int ≥ 1 | Every N. |
| `weekdays` | int[] | For weeks (0 Sun…6 Sat). |
| `month_day` | int, null | For monthly (1–31; short months use their last day). |
| `ends_on` | date, null | |
| `max_count` | int, null | |
| `lead_working_days` | int | ≥ the type's total SLA working days. |
| `next_publish` | date | The next occurrence's publishing date. |
| `made_count` | int | |
| `skip_next` | bool | |
| `stopped_at` | timestamptz, null | |

### tasks.recurrence_key
`text`, unique, null: `'<ruleId>:<publishDate>'`; makes each occurrence exactly once.
