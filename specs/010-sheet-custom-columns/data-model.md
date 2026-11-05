# Data Model: Sheet Columns You Can Shape

## 1. Schema (`prisma/schema.prisma`, applied with `db push`)

### `SheetColumn` (`sheet_columns`): new

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid()) @db.Uuid` | |
| `sheet` | `String` | `'content'` or `'video'` |
| `key` | `String` | A built-in column key (`status`, `fileName`…) or `c:<id>` for a custom column |
| `name` | `String?` | Null = default name (translated) |
| `position` | `Int` | Order within the sheet; Title is always first |
| `width` | `Int?` | 60–600; null = default |
| `shown_in` | `String[]` | Sets that show it. Empty and `shown_default = true` means default |
| `shown_default` | `Boolean @default(true)` | True until someone hides or shows it |
| `kind` | `String?` | Custom only: `text` · `number` · `date` · `link` · `person` · `choice` · `checkbox` |
| `options` | `Json @default("[]")` | Choice only: `[{ id, name, color }]` |
| `deleted_at` | `DateTime? @db.Timestamptz(6)` | Custom only; soft delete for Undo |
| `created_by`, `updated_by` | `String? @db.Uuid` | → `Member`, SetNull |
| `created_at`, `updated_at` | `DateTime @db.Timestamptz(6)` | |

Unique: `@@unique([sheet, key])`. Index: `@@index([sheet, position])`.

### `SheetValue` (`sheet_values`): new

| Field | Type | Notes |
|---|---|---|
| `column_id` | `String @db.Uuid` | → `SheetColumn`, Cascade |
| `task_id` | `String @db.Uuid` | → `Task`, Cascade |
| `value` | `String @db.Text` | Normalised (research R3) |
| `updated_by` | `String? @db.Uuid` | → `Member`, SetNull |
| `updated_at` | `DateTime @default(now()) @db.Timestamptz(6)` | |

Primary key: `@@id([column_id, task_id])`.

## 2. Types (`src/types/index.ts`)

```ts
export type SheetId = 'content' | 'video'
export type ColumnKind = 'text' | 'number' | 'date' | 'link' | 'person' | 'choice' | 'checkbox'
export interface ChoiceOption { id: string; name: string; color: string }
export interface SheetColumnRecord {
  id: string; sheet: SheetId; key: string; name: string | null; position: number; width: number | null
  shownDefault: boolean; shownIn: string[]; kind: ColumnKind | null; options: ChoiceOption[]
  deletedAt: string | null; updatedBy: string | null; updatedAt: string
}
/** column id → task id → normalised value */
export type SheetValues = Record<string, Record<string, string>>
```

## 3. Pure module (`src/lib/sheet-columns.ts`)

| Function | Does |
|---|---|
| `applyLayout(builtIns, records, { sheet, set })` | Returns `LaidColumn[]` (R4) |
| `parseValue(kind, raw, { members, options })` | Returns `{ ok: true, value } \| { ok: false, code: 'number' \| 'date' \| 'link' \| 'person' \| 'choice' \| 'long' }` |
| `formatValue(kind, value, ctx)` | Returns display text (also used for copy and kind changes) |
| `checkName(name, current, exceptKey?)` | Returns `null` or `'empty' \| 'long' \| 'taken'` |
| `headingKey(heading, laid, aliases)` | Returns the column a pasted heading fills, or null |
| `nextChoiceColor(options)` | Returns the next unused colour from `CHOICE_COLORS` |

## 4. Loader (`src/app/(app)/board/page.tsx`)

Adds:
- `sheetColumn.findMany({ where: { deleted_at: null } })`, with the updater's name;
- `sheetValue.findMany({ where: { column: { deleted_at: null } } })`.

The results go to `KanbanBoard` as `sheetColumns` and `sheetValues`. They are split by sheet for `VideoSheet` and `ContentSheet`.
