# Data Model: Sheet Formatting, Editing Tools and Comments

**Feature**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

Additive only, applied with `db push` (`scripts/migrate.sh`). There is no backfill: with no rows, every cell keeps today's look.

## 1. New tables

### `sheet_formats` (Prisma `SheetFormat`), stage 1

| Field | Type | Rules |
|---|---|---|
| `sheet_id` | uuid → sheets, cascade | Blank, Content or Video sheet |
| `row_key` | text | A blank row id or a task id. `''` means every row |
| `col_key` | text | A blank column id or a column key (`title`, `c:<uuid>`). `''` means every column |
| `style` | jsonb | `CellStyle` (research R3), validated |
| `updated_by` | uuid → members, null on delete | |
| `updated_at` | timestamptz | |

Primary key: `(sheet_id, row_key, col_key)`. An empty `style` deletes the row.

### `sheet_merges` (Prisma `SheetMerge`), stage 1, blank sheets only

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Made by the client (for undo) |
| `sheet_id` | uuid → sheets, cascade | |
| `top_row`, `bottom_row` | uuid | Row ids |
| `left_col`, `right_col` | uuid | Column ids |

Merges in a sheet never overlap; the server refuses overlaps.

### `sheet_comments` (Prisma `SheetComment`), stage 1

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | |
| `sheet_id` | uuid → sheets, cascade | |
| `row_key`, `col_key` | text | As in `sheet_formats` |
| `root_id` | uuid → sheet_comments, null | Null for the first comment of a thread |
| `author_id` | uuid → members, null on delete | |
| `body` | text | 1–5,000 characters |
| `mentions` | uuid[] | Members @mentioned |
| `created_at`, `edited_at`, `deleted_at` | timestamptz | `deleted_at` is a soft delete |
| `resolved_at`, `resolved_by` | timestamptz, uuid | Set on the root only |

Indexes: `(sheet_id, row_key, col_key)` and `(root_id)`.

### `sheet_rules` (Prisma `SheetRule`), stage 3

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | |
| `sheet_id` | uuid → sheets, cascade | |
| `range` | jsonb | `{ rows: rowKey[] \| 'all', cols: colKey[] }` |
| `kind` | text | `gt`, `lt`, `between`, `eq`, `contains`, `date`, `dup`, `unique`, `top`, `bottom`, `bar` or `scale` |
| `args` | jsonb | The kind's values |
| `style` | jsonb | `CellStyle` (unused by `bar` and `scale`) |
| `priority` | integer | 0 is applied first |

### `sheet_tables` (Prisma `SheetTable`), stage 3, blank sheets only

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | |
| `sheet_id` | uuid → sheets, cascade | |
| `top_row`, `left_col`, `bottom_row`, `right_col` | uuid | The table's corners |
| `style` | text | A table style key |
| `header` | boolean | Has a header row |
| `banded` | boolean | Banded rows |

## 2. Changed tables

| Table | Change | Stage |
|---|---|---|
| `sheet_rows`, `sheet_cols` | `hidden boolean default false` | 2 |
| `sheets` | `frozen_rows int default 0`, `frozen_cols int default 0` | 2 |
| `sheets` | `view jsonb default '{}'`: `{ filter?, sort?, hiddenRows?: taskId[], hiddenCols?: colKey[] }` (the filter for all sheets; sort and hidden rows and columns for the Content and Video sheets) | 2–3 |
| `notifications` | No schema change. New `kind` values `sheet_mention` and `sheet_reply`, with `meta` `{ sheet_id, folder_id, sheet_name, cell, row_key, col_key, snippet }` | 1 |

## 3. Types (`src/types/index.ts`)

```text
CellStyle, BorderSide, NumberFormat           # research R3
SheetFormatRecord { rowKey, colKey, style }
SheetMergeRecord { id, top, left, bottom, right }
SheetCommentThread { id, rowKey, colKey, resolved: { at, by } | null, comments: SheetCommentItem[] }
SheetCommentItem { id, authorId, body, mentions, createdAt, editedAt, deleted }
SheetView { frozenRows, frozenCols, filter?, sort?, hiddenRows?, hiddenCols? }
ConditionalRule, SheetTableRecord             # stage 3
SheetDoc gains: formats, merges, view, threads (summary: id, rowKey, colKey, count, resolved)
```
