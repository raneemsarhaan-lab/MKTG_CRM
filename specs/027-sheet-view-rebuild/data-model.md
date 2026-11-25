# Data Model: Sheet view rebuild

Additive changes only (scripts/schema-guard.sh). Existing tables keep every row; nothing is renamed or dropped.

## Sheet (table `sheets`) — a tab

| Field | Change | Meaning |
|---|---|---|
| kind | values added | `'board'` (a Space's Board tab where it isn't `linked_content`/`linked_video`), `'rows'` (an added tab of grouped rows); `'blank'` stays the spreadsheet tab |
| linked | **new** Boolean, default false | Added tab linked to the board. The Board tab is always treated as linked. |
| space_id | **new** UUID, nullable | The Space whose board a `rows` tab links to (a Brand page's tab: chosen per row) |
| created_by | existing | The tab's creator: may link, unlink, rename, delete it |

Rules: the Board tab is first (`position 0`), can't be moved, renamed away from "Board", unlinked or deleted. A deleted `rows` tab removes the tab and its plain rows only; linked rows' tasks stay.

## ContentRow (table `content_rows`) — a row in any tab

| Field | Change | Meaning |
|---|---|---|
| sheet_id | **new** UUID, nullable | The added tab this row is in. Null: the Space's Board tab (as today). |
| last_task_id | **new** UUID, nullable | The task a row was linked to before "Unlink row" / "Unlink from board"; used to reconnect without duplicates |
| task_id, pillar_id, parent_id, title, values, position | existing | As today |

Constraints: unique `(space_id, task_id)` stays (Board tab rows); new unique `(sheet_id, task_id)` (one row per task per added tab). Rows in added tabs carry `space_id = NULL`.

State transitions of a row:

```text
plain (no task, no last_task)
  ├─ Make task / tab linked / titled in a linked tab ──► linked (task_id = T)
linked (task_id = T)
  ├─ Unlink row / tab unlinked ──► remembered (task_id = null, last_task_id = T, values = last task values)
  ├─ Remove from this tab ──► row deleted (task stays)
  └─ Archive the task ──► linked, task archived (row shows Restore)
remembered (last_task_id = T)
  └─ tab linked / Make task ──► linked (task_id = T, reconnected; no new task)
```

## ContentSheetTheme (table `content_themes`) — a theme placed on a tab

| Field | Change | Meaning |
|---|---|---|
| sheet_id | **new** UUID, nullable | The added tab this theme is placed on. Null: the Space's Board tab (as today, with `space_id`). |

Constraints: unique `(space_id, project_id)` stays; tab themes carry `space_id = NULL` and a new unique `(sheet_id, project_id)`. Order (`position`) and pillar order are per tab, so dragging reorders this sheet only.

## Per-person layout

Existing `members.sheet_layouts` (`{ viewKey: { cols, widths } }`) gains keys per tab (`tab:<sheetId>`), plus `sort`, `group` and `collapsed` per key. Shared Mine/Everyone and Board filters are kept per page on the person's device (browser storage `momentum.scope.<page>` / `momentum.filters.<page>`, where Mine/Everyone already lived), read by both the Board view and the Board tab. Moving them to the server (member prefs) is a follow-up if they must follow a person across devices.

## Views (Stage A)

`saved_views` unchanged; new actions rename and duplicate a view. "Set as default" is the existing per-person home view.

## Conversion report (Stage D)

Read-only: for each old tab, `{ sheet id, name, from folder, to (Space workbook | Board tab | unmatched), rows, cells, formats, comments }`, plus totals before/after for tasks, content_rows, sheet_columns, sheet_values, sheet_cells, sheet_formats, sheet_comments.
