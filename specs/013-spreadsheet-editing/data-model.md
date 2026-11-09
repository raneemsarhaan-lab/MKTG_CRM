# Data Model: Spreadsheet Editing and Sheet Tabs

**Feature**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

Everything is additive and applied with `db push` (`scripts/migrate.sh`). Names follow the schema's style: snake_case tables, uuid ids, `timestamptz`.

## 1. New tables

### `sheet_folders` (Prisma `SheetFolder`)

| Field | Type | Rules |
|---|---|---|
| `id` | uuid, primary key | |
| `kind` | text | `content` · `video` · `team`. One `content` and one `video` folder at most (partial unique index), created by the backfill (R11) |
| `name` | text | Team folders: 1–60 characters, unique among live folders, ignoring case and surrounding spaces. Linked folders: null, so the name comes from the translations ("Content", "Video") |
| `created_by` | uuid → members, null on delete | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Bumped by any change inside the folder; the home page's "last edited" |
| `updated_by` | uuid → members, null on delete | Who made that change |

Linked folders can't be renamed or deleted (FR-074, FR-077). Deleting a team folder cascades to its sheets, and from there to rows, columns and cells. The 10-second Undo happens before the delete reaches the server (R12).

### `sheets` (Prisma `Sheet`)

| Field | Type | Rules |
|---|---|---|
| `id` | uuid, primary key | |
| `folder_id` | uuid → sheet_folders, cascade | |
| `kind` | text | `linked_content` · `linked_video` · `blank`. One sheet of each linked kind (partial unique index), always in its own folder kind |
| `name` | text | Blank: 1–50 characters, unique in the folder ignoring case and surrounding spaces, without `\ / ? * [ ] :`. Linked: null, so the name comes from the translations ("Content library", "Clips") |
| `position` | integer | Order in the folder, 0…n−1, rewritten for the folder on every reorder |
| `tab_color` | text, null | A palette key: `red` · `orange` · `yellow` · `green` · `teal` · `blue` · `purple` · `pink` · `gray` · `black`. Null means no colour |
| `hidden` | boolean, default false | At least one sheet per folder stays visible. Linked sheets are never hidden |
| `protected_by` | uuid → members, null | Set means protected. Only this member and admins may edit or unprotect. Never set on linked sheets |
| `row_count`, `col_count` | integer | Blank only: the counts for the home page and limits. Kept in step with `sheet_rows` and `sheet_cols` in the same transaction |
| `created_by`, `updated_by` | uuid → members, null on delete | |
| `created_at`, `updated_at` | timestamptz | `updated_at` is bumped on every content change; the client's freshness check (R6) |

Indexes: `(folder_id, position)`.

### `sheet_rows` and `sheet_cols` (Prisma `SheetRow`, `SheetCol`)

These are for blank sheets only.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid, primary key | Made by the client for inserts, so undo and redo reuse the same id (R5) |
| `sheet_id` | uuid → sheets, cascade | |
| `position` | double precision | Midpoint of its neighbours. Renumbered 1…n when a gap falls under 1e-6 (R3) |
| `height` (rows) / `width` (cols) | integer, null | Rows: 21–400 px. Columns: 40–600 px. Null means the default (32 px rows, 120 px columns) |

Indexes: `(sheet_id, position)`. Limits: 5,000 rows and 200 columns per sheet (FR-052), checked on insert.

### `sheet_cells` (Prisma `SheetCell`)

| Field | Type | Rules |
|---|---|---|
| `sheet_id` | uuid → sheets, cascade | |
| `row_id` | uuid → sheet_rows, cascade | |
| `col_id` | uuid → sheet_cols, cascade | |
| `value` | text | 1–50,000 characters, stored as typed. No formulas: "=1+1" is text |
| `updated_by` | uuid → members, null on delete | |
| `updated_at` | timestamptz | |

Primary key `(row_id, col_id)`. Index `(sheet_id)`. An empty value deletes the row, so only filled cells are stored.

### `linked_row_heights` (Prisma `LinkedRowHeight`)

| Field | Type | Rules |
|---|---|---|
| `sheet_kind` | text | `linked_content` · `linked_video` |
| `task_id` | uuid → tasks, cascade | |
| `height` | integer | 21–400 px |

Primary key `(sheet_kind, task_id)`. Shared by the team, like spec 010's column widths (FR-045).

## 2. Changed tables

| Table | Change | Why |
|---|---|---|
| `members` | `sheet_pins uuid[]`, null | The member's pinned folders, in order. Null means the default (Content, then Video) (R10) |
| `sheet_values` (spec 010) | No schema change. `setValues` now allows any member on a live task (R8) | FR-060 |

The linked sheets' column records (`sheet_columns`, spec 010) are unchanged. Their `width` is the linked sheet's column width.

## 3. Rules the server enforces

- **Every sheet action:** checks the session member. Blank-sheet content changes are refused on a protected sheet unless the member is `protected_by` or an admin (`protected`).
- **Names:** trimmed; refused when empty, too long, already used, or containing a forbidden character (`name_empty`, `name_taken`, `name_chars`).
- **Delete and Hide:** refused for linked sheets (`linked`) and for the folder's last visible sheet (`last_visible`).
- **Move or Copy:**
  - A linked sheet can only be copied (`linked`). The copy becomes a blank sheet holding the linked sheet's visible columns and rows as text, made by the client from what it shows and sent as an ordinary paste into the new sheet.
  - A name already used at the destination gets "(2)", "(3)".
- **Limits:**
  - 5,000 rows, 200 columns (`too_many_rows`, `too_many_cols`);
  - 50,000 characters per cell (`too_long`);
  - 2,000 cells per call (the client chunks).
- **Concurrency:** writes are per cell, so the last write wins for that cell. A change to a row or column that no longer exists is skipped and reported (`gone`), and the client refreshes the sheet.

## 4. The client's view of a blank sheet

```text
SheetDoc {
  id, folderId, name, color, hidden, protectedBy, updatedAt
  rows: { id, position, height|null }[]      // sorted by position
  cols: { id, position, width|null }[]       // sorted by position
  cells: Map<rowId, Map<colId, string>>      // filled cells only
}
```

Loaded per sheet when its tab opens (`loadSheet`); the folder page loads only the tab list. A sheet of 5,000 × 26 with 20,000 filled cells is about 1 MB of JSON. Larger sheets load the first 1,000 rows' cells, then the rest in the background.

## 5. Backfill (`scripts/sheets-backfill.ts`, safe to run twice)

1. If no `content` folder exists, create it with its `linked_content` sheet at position 0.
2. The same for `video` and `linked_video`.
3. Nothing else. Members' pins stay null, which means the default.
