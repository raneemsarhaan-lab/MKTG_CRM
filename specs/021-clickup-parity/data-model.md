# Data Model: Brands, Team Spaces and Views (spec 021)

All changes add to what exists; no column is removed or renamed. Table names are snake_case through `@@map`, as elsewhere in `prisma/schema.prisma`. Rows that already exist change only through `once()` markers in `prisma/seed.ts` (HANDOVER ground rule 10).

## New tables

### TeamSpace → `team_spaces`

A lens on one team's work across every brand.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `key` | string, unique | Stable key: 'content', 'design', 'video', 'planning'; new ones are generated from the name. |
| `name` | string | Shown in the sidebar. English and Arabic come from messages for the four seeded keys; other Spaces show their stored name. |
| `color` | string | Hex, from the token palette. |
| `is_production` | bool, default false | True for Design and Video. The hand-off looks for these (FR-033). |
| `default_kind` | string, default 'pipeline' | 'pipeline' or 'simple'. Planning is 'simple' (FR-023). |
| `words` | Json, default `{}` | `{ [stageId or simpleStatus]: string[] }`. Unused for 'content' and 'video', which read their sheet's `view.words` (research R5). |
| `sort_order` | int | Sidebar order. |
| `archived_at` | timestamptz? | Archived Spaces leave the sidebar; their tasks keep Shows in rows. |
| `created_at`, `updated_at` | timestamptz | |

**Validation**:
- A word may map to only one stage or status in a Space (spec US3 scenario 4).
- Only admins create, archive and delete. Deleting requires an archived Space (FR-004).

### TeamSpaceMember → `team_space_members`

| Field | Type | Notes |
|---|---|---|
| `space_id` | uuid → TeamSpace | Cascade on delete. |
| `member_id` | uuid → Member | Cascade on delete. |
| `added_at` | timestamptz | |

The PK is (`space_id`, `member_id`). It is filled from job roles once (research R3) and edited by admins afterwards.

### TaskSpace → `task_spaces` (Shows in)

| Field | Type | Notes |
|---|---|---|
| `task_id` | uuid → Task | Cascade on delete. |
| `space_id` | uuid → TeamSpace | Cascade on delete. |
| `added_via` | string | 'created', 'assignee', 'handoff', 'manual' or 'migration'. |
| `added_by` | uuid? → Member | SetNull. |
| `added_at` | timestamptz | |

The PK is (`task_id`, `space_id`), with an index on `space_id`.

**Rules**:
- A row is added when a task is created from a Space (FR-028).
- A row is added when the assignee belongs to the Space (FR-029). Spaces whose `default_kind` is 'simple' are skipped for pipeline tasks.
- Rows are added on hand-off (FR-031).
- A row is never removed automatically; only a manual removal deletes one (FR-032).

### SavedView → `saved_views`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `node` | string | 'everything', 'me', 'space:<id>', 'brand:<id>' or 'brand:<id>:<folder>' (folder ∈ cal, assets, sheet, lib). |
| `type` | string | 'list', 'board', 'sheet', 'calendar', 'workload', 'files' or 'gallery'. |
| `name` | string | |
| `config` | Json | `{ filters, group, sort, fields, order, campaign? }` |
| `owner_id` | uuid? → Member | null = shared; set = personal (FR-010). Cascade on delete. |
| `position` | int | Tab order. |
| `created_by` | uuid? → Member | SetNull. |
| `created_at`, `updated_at` | timestamptz | |

There is an index on (`node`, `owner_id`). Shared views may be edited by admins, superusers and the creator. Personal views may be edited only by their owner.

## Changed tables

### Task → `tasks`

| Field | Type | Notes |
|---|---|---|
| `kind` | string, default 'pipeline' | 'pipeline' or 'simple'. Fixed after creation, like `nine_stage` (FR-022). |
| `simple_status` | string? | 's-todo', 's-doing' or 's-done' when `kind = 'simple'`; null otherwise. |

**Rules**:
- For a simple task, `status` stays 'todo' (to satisfy the foreign key) and is ignored. `stage_date` is not used: simple tasks have no SLA.
- Pipeline readers filter `kind = 'pipeline'`: the Board pipeline columns, SLA, review queues, Inbox, notifications to stage holders, the Content and Video sheets, and the Library.
- `brand_id` stays nullable. A null brand shows as the virtual **"No brand"** brand; no row is created for it.

**State transitions (simple)**: s-todo ↔ s-doing ↔ s-done. Any member who may edit the task (`canAct`) may move it. Moving to s-done celebrates for the assignee (FR-024).

### Brand → `brands`

| Field | Type | Notes |
|---|---|---|
| `features` | Json, default `{}` | Overrides only: `{ priorities?, platform?, type?, pillars?, hours?, covers?, clips?, sla? : boolean }`. A missing key falls back to the workspace default. |
| `nine_stage_default` | bool? | null = the workspace default. Read at task creation (research R11). |

### WorkspaceSettings → `workspace_settings`

| Field | Type | Notes |
|---|---|---|
| `brand_feature_defaults` | Json, default `{}` | Default switches for brands; a missing key means on. |

### SheetFolder → `sheet_folders`

| Field | Type | Notes |
|---|---|---|
| `brand_id` | uuid? → Brand, unique | Set only on `kind = 'brand'` folders: the brand's blank tabs (research R6). Cascade on delete. |

`kind` gains the value 'brand'. These folders are hidden from the Sheets home list and shown under their brand.

### SheetColumn / SheetValue (spec 010), no schema change

The `sheet` key gains values of the form `me:<memberId>` for the private "My notes" style columns on My tasks (research R7).

## Derived (not stored)

| Thing | Derived from |
|---|---|
| Brand Folder **Calendar** | Tasks with `brand_id`, with a campaign (`project_id`) filter. |
| Brand Folder **Assets** | `brand_assets` rows plus the brand's open tasks of type Design. |
| Brand Folder **Sheet** | The Content and Video sheets with a brand predicate, plus the brand folder's blank tabs. |
| Brand Folder **Library** | Tasks with `status = 'publish'` and `kind = 'pipeline'` for the brand, showing `published_url` / `post_url`. |
| **My tasks** | Tasks where `assignee_id = me`, plus tasks where `task_owner_id = me AND assignee_id ≠ me` (Handed off). |
| **Everything** | Every task the member loads today (all tasks). |
| Production Spaces | `team_spaces.is_production`. |

## One-time migrations (`prisma/seed.ts`)

### `once('spaces-v1')`
1. Create the Spaces:
   - Content: pipeline;
   - Design: pipeline, production;
   - Video: pipeline, production;
   - Planning: simple.
2. Add members by job role (research R3).

### `once('task-spaces-v1')`
For every task, add the starting rows with `added_via = 'migration'`:
- Planning, if the task is simple (none exist yet).
- Otherwise:
  - Content;
  - plus Design, if the task is not Video or Reel and is at `r-design` or later;
  - plus Video, if it is Video or Reel and at `r-design` or later.
- Plus every Space its assignee belongs to (pipeline-kind Spaces only for pipeline tasks).

### Properties
- Both migrations are idempotent: `createMany` with `skipDuplicates`.
- The task count before and after is logged and must match (FR-008, SC-001).
- No task's stage, owner, dates or SLA clock changes.
