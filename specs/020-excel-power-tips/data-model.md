# Data Model: Excel Power Tips in the Sheets

All additions are optional. Existing rows read as before.

## New table: `sheet_validations` (tip 18)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `sheet_id` | uuid FK → sheets, on delete cascade | |
| `top_row`, `bottom_row` | uuid | row ids at the range's edges, as `sheet_merges` |
| `left_col`, `right_col` | uuid | column ids |
| `values` | jsonb | `{ text: string; color?: '#RRGGBB' }[]`, 1–100 items, each text 1–80 characters, unique ignoring case |
| `mode` | text | `'reject'` or `'warn'` |
| `created_by`, `updated_at` | | as the other sheet tables |

**Rules:**

- At most 200 per sheet.
- Ranges may not overlap. A new rule over an old one replaces it, after a confirm.
- Undo kind `validations` stores `{ before, after }` lists, like `tables`.

## Changed: `sheet_tables` (tips 73, 79)

- **New column:** `totals jsonb NULL`, a map `{ [colId]: 'sum' | 'avg' | 'count' | 'countNums' | 'min' | 'max' | 'none' }` (Excel's Total row choices).
- **Null:** no Total row.

## Changed: `workspace_settings` (tip 17)

- **New column:** `fill_lists jsonb NOT NULL DEFAULT '[]'`, holding `{ id: string; name: string; items: string[] }[]`.
- **Limits:** at most 50 lists, 2–200 items each, each item 1–60 characters.
- **Who edits:** admins only (server-checked).

## Changed: `sheets.view` JSON (tips 74, 80)

- **`outline`**: `{ kind: 'rows' | 'cols'; from: id; to: id; level: 1–8; collapsed: boolean }[]`, at most 200.
- **`slicers`**: `{ id: string; tableId: string; col: string }[]`, at most 20.
- **`advanced`** (stage B, as built): `{ top, left, bottom, right: id; groups: { col: id; op: 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le' | 'begins'; value: string }[][]; unique?: boolean }`. It is the Advanced Filter in place over its list range, read from Excel's criteria range (approved design power-tips-b). Within a group the conditions are joined with AND; the groups are joined with OR. It is kept beside `filter`, not inside a column's filter, because it spans the list's columns. Null clears it.

## Changed: formats (`CellStyle`, `NumberFormat`) (tips 23–26, 95)

- **`CellStyle.unlocked?: boolean`**: an input cell that stays editable while the sheet is protected.
- **`CellStyle.ha`** gains `'across'` (Center across selection).
- **`NumberFormat.kind`** gains `'custom'`, with `pattern: string` (≤ 60 characters, the subset in research R7).

## Changed: conditional rules (`ConditionalRule`) (tips 27–28)

- **`RULE_KINDS`** gains `'icons'`, with `args.set: 'arrows3' | 'flags3' | 'lights3'` and `args.cuts: [number, number]` (percent or number via `args.by`), plus `args.reverse` and `args.iconOnly`.
- **`args.row?: boolean`** with **`args.col`** (the column tested): apply the look to the whole row of the range (blank sheets).

## Kept in the browser (per member, not shared)

- **`momentum.sheet.zoom.<sheetId>`**: 50–200.
- **`momentum.sheet.stats`**: `{ min: boolean; max: boolean }`.

## Not stored

- Go to special results, the fill preview, the Auto Fill Options choice, and the repeat-last command.
- The Total row's numbers, which are computed from the visible rows when the sheet renders.
