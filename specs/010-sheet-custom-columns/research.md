# Research: Sheet Columns You Can Shape

Decisions for [plan.md](./plan.md). Each entry gives the decision, why it was chosen, and the alternatives considered.

## R1. One record per touched column, built-in or custom

**Decision**: A table, `sheet_columns`, keyed by `(sheet, key)`.
- **Built-in columns** use their code key (`status`, `doc`, `fileName`…).
- **Custom columns** use `c:<uuid>`.
- **Fields:**
  - `name` (null = the default, translated name);
  - `position`;
  - `width` (null = default);
  - `shown_default` and `shown_in` (default visibility until someone hides or shows it; then the list of sets that show it);
  - `kind` and `options` (custom only);
  - `deleted_at`;
  - `updated_by`, `updated_at`; `created_by`, `created_at`.

The first layout change on a sheet writes a record for every built-in column, at its default position. After that, every column has a position, and a move only renumbers.

**Rationale**:
- Order is one list mixing built-in and custom columns.
- Two people changing different columns must not overwrite each other, which a single JSON blob per sheet would do.
- Each record carries its own "last changed by" (FR-004).

**Alternatives**:
- A JSON layout per sheet: rejected, because of lost updates.
- Separate tables for built-in overrides and custom columns: rejected, because ordering across two tables is awkward.

## R2. Concurrency

**Decision**: Every layout action:
- runs in a transaction;
- takes `pg_advisory_xact_lock(hashtext('sheet-columns:' || sheet))` with `$executeRaw`, as in spec 009;
- re-reads the records;
- applies one change.

Last write wins per column (spec edge case). The client applies the change optimistically, then refreshes.

## R3. Values

**Decision**: A table, `sheet_values (column_id, task_id, value text, updated_by, updated_at)`, unique on the pair. Values are stored normalised:

| Kind | Stored as |
|---|---|
| Text | trimmed, ≤ 2000 chars |
| Number | canonical decimal string |
| Date | `YYYY-MM-DD` |
| Link | the URL |
| Person | a member id |
| Choice | an option id |
| Checkbox | `"1"`, or no row |

An empty value deletes the row. Both tables cascade on delete of the column or the task.

**Rationale**: One shape for every kind keeps paste, copy and kind changes simple. The kind's parser is the only gate.

## R4. Applying a layout

**Decision**: A pure function, `applyLayout(builtIns, records, { sheet, set })`, returns ordered columns: `{ key, builtIn, name, defaultName?, width, shown, kind?, options? }`.
- **No records:** built-in default order, widths and the sets of `COLUMN_SETS` (Video) or all shown (Content).
- **Records:** sorted by position.
  - A built-in missing from the records (added to the code later) is inserted after its default predecessor.
  - Deleted custom columns are dropped.
- **Title** is always first and shown (FR-031).

`shown` comes from `shown_in` once `shown_default` is false; otherwise from the set's default. On the Content sheet the set is `'all'`.

**Rationale**: One function for both sheets, the lab and paste matching. Pure, so it is checkable in Node.

## R5. Grid core changes

**Decision**: `GridModel` gains optional hooks:
- `headerMenu(col, anchor)`;
- `onReorder(col, beforeCol)`;
- `onResize(col, width)`;
- `fitWidth(col)`.

Header cells get:
- a menu button (▾), shown on hover and focus;
- `draggable` headings (not Title), with a drop indicator between columns;
- a 6 px resize handle on the inline-end edge: pointer drag clamps to 60–600 px, and a double-click measures the widest rendered cell's `scrollWidth`.

Right-to-left mirrors all of this. On touch devices dragging is off; the menu remains.

**Rationale**: These are generic grid behaviours. The sheets supply what they mean.

## R6. The keyboard path

**Decision**:
- **Columns panel:** a **Columns** button in each toolbar opens a popover listing every column in order. Each row has:
  - a checkbox (shown);
  - the name, with "changed by X, when" as its accessible description and tooltip (FR-004);
  - a ⋯ menu with Rename, Move up, Move down, Insert before, Insert after, Edit column, Reset name, Delete.
- **+ Column** opens the column editor.
- **Header menu:** the same actions, for the pointer.
- **Shortcut:** from any grid cell, `Alt+↓` opens that column's header menu, so keyboard users can act on the column they're in.

**Rationale**: Grid headers are outside the grid's single tab stop. The panel and Alt+↓ give full keyboard access without changing the grid's focus model (FR-061, SC-008).

## R7. Custom cells

**Decision**: `CustomCell.tsx` exports `customRender(kind, value, ctx)` and a host-side `openCustom(...)`:

| Kind | Edited with |
|---|---|
| Text, Number, Date | the grid's own text editing (`isText`, `textValue`, `onCommit`) |
| Link | the shared `LinkPrompt`, refusing non-links |
| Person | the `editorMenuItems` menu, with avatars |
| Choice | a menu of coloured pills, plus "Clear" |
| Checkbox | Space, Enter or a click toggles it (via `onActivate`) |

Delete on a custom cell clears its value. A refused value leaves the old value and shows the cell note (FR-023). Custom cells are read-only on archived pieces and dropped clips, and on rows the member may not edit (FR-024).

## R8. Video column sets

**Decision**:
- Order is shared by Editing, Copy and Full.
- Hiding or showing changes `shown_in` for the current set only (FR-033).
- A new custom column gets `shown_in = ['full', currentSet]` (FR-034).
- Built-in defaults come from `COLUMN_SETS`.

## R9. Paste

**Decision**:
- **Matching:** `applyLayout` gives each column's current name. Heading matching normalises case and spaces, and checks current names first, then the built-in heading aliases already in `parse-plan.ts` / `parse-clips.ts`.
- **Custom values:** parsed with `parseValue`. A failure becomes a preview problem ("Not a number", "Not a link"…) and is never sent.
- **Unknown headings:** listed as "Not imported: X", with **Add as a column** (Text), which calls `addColumn` before Add.
- **Server side:** `addPlan` (Content) and `addClips` (Video) accept `custom: Record<columnId, string>` per row, re-parse it, and write `sheet_values` in the same transaction.

## R10. Delete and Undo

**Decision**:
- `deleteColumn` sets `deleted_at` and returns the count of values.
- The toast offers Undo for 10 s, which calls `restoreColumn` (clears `deleted_at`).
- Values stay until a later `deleteColumn` purges columns deleted more than 1 day ago (lazy cleanup).

The confirmation's count comes from the values the client already holds.

## R11. Kind changes and choice options

**Decision**: `updateColumn(id, { name?, kind?, options?, replace?: Record<optionId, optionId | null> })`.
- **Kind change:** the client first runs `parseValue(newKind, formatValue(oldKind, v))` over the values it holds, and lists those that fail. On confirmation, the server repeats the conversion in a transaction and clears the failures.
- **Removing an option in use:** requires a `replace` entry for it (another option or null).
- **Choice colours:** from `CHOICE_COLORS`, chosen in order.

## R12. Limits and names

**Decision**:
- **Names:** 1–40 chars, trimmed, unique per sheet ignoring case and extra spaces, compared with every current name (built-in defaults in English included, so "Status" can't be a custom name while Status keeps its default).
- **Limits:** ≤ 30 live custom columns per sheet; ≤ 50 options; widths 60–600 px.
- **Checks:** `checkName` and the limits are pure, checked on the client for messages and on the server for truth.
