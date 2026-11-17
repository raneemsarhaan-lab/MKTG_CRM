# Server Contracts: Excel Power Tips

Every action uses the standard `{ success: true, … } | { success: false, error }` shape. Every action re-checks the session, the sheet's protection, and the limits in [data-model.md](../data-model.md).

## `applySheetChanges(sheetId, changes)`: new change kinds

| Key | Shape | Rule |
|---|---|---|
| `validations` | `{ put: ValidationRecord[]; remove: string[] }` | ranges by existing row and column ids; values cleaned (trimmed, unique, ≤ 100); `mode ∈ reject\|warn` |
| `tableTotals` | `{ id: string; totals: Record<colId, Agg> \| null }[]` | the table must belong to the sheet; columns must be inside it |
| `view.outline`, `view.slicers` | see the data model | validated like `groupBy` (spec 019) |

**Protection:**

- While a sheet is protected, a member who isn't its protector or an admin may only send a `cells` change.
- Every cell in it must resolve (cell → row → column → sheet layers) to `unlocked: true`.
- Otherwise the change is refused with `protected`, as today.

## `loadSheet` / `loadExtras`

- **Validations:** loaded alongside merges and tables, as `extras.validations: ValidationRecord[]`.
- **Tables:** each table carries `totals`.

## Settings

- **`loadFillLists(): { lists: FillList[] }`**: any member.
- **`saveFillLists(lists)`**: admins only. Lists are cleaned to the limits.

## Unchanged

- **`writeTaskFields` and `writeTaskCells`:** fill and pick on linked sheets go through them, cell by cell, as typing does.
- **No formula evaluation anywhere.** Text that starts with "=" stays text (spec FR-015).
