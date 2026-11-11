# Server Contract: Sheet Formatting, Editing Tools and Comments

The existing actions are in `src/actions/sheets.ts`; comments are in `src/actions/sheet-comments.ts`. Every action checks the session member and returns `{ success: false, error }` on refusal.

## Loading

| Action | Change |
|---|---|
| `loadSheet(id)` (blank) | Also returns `formats`, `merges`, `view`, `frozen`, hidden rows and columns, and thread summaries `{ id, rowKey, colKey, count, resolved }` |
| `loadLinkedSheetExtras(sheetId)` (new; Content and Video) | `{ formats, view, threads }` for that linked sheet |

## Saving formats and view

**`applySheetChanges(sheetId, changes)`** (blank) gains these fields:

```text
formats?: { rowKey, colKey, style: CellStyle | null, mode: 'set' | 'merge' }[]
merges?: { add?: { id, top, left, bottom, right }[], remove?: string[] }
view?: { frozenRows?, frozenCols?, hideRows?, showRows?, hideCols?, showCols?, filter? }
```

- **Formats and merges** are refused on a protected sheet unless the member is its protector or an admin (`protected`).
- **Styles** are validated (research R3); invalid fields are dropped.
- **Overlapping merges** are refused (`merge_overlap`).
- **Every formats call** is limited to 20,000 records.

**`applyLinkedFormats(sheetId, { formats?, view? })`** (new; Content and Video):
- any member;
- never touches tasks;
- the same validation as above;
- `merges` are refused (`linked`).

## Comments (`src/actions/sheet-comments.ts`)

| Action | Who | Effect |
|---|---|---|
| `listThreads(sheetId, { resolved? })` | anyone who can open the sheet | Threads with their comments, newest first |
| `getThread(threadId)` | anyone who can open the sheet | One thread |
| `addComment(sheetId, { rowKey, colKey, body, mentions })` | any member, even on a protected sheet | Creates a thread and notifies `sheet_mention` |
| `reply(threadId, { body, mentions })` | any member | Notifies the mentions (`sheet_mention`) and the thread's earlier participants (`sheet_reply`, grouped) |
| `editComment(id, body, mentions)` | the author only | Sets `edited_at`; new mentions are notified |
| `deleteComment(id)` | the author, or an admin | Soft delete |
| `resolveThread(id)`, `reopenThread(id)` | any member | Sets or clears `resolved_at` / `resolved_by` |

- **Limits:** a body is 1–5,000 characters; at most 20 mentions per comment.
- **Error codes:** `not_found`, `not_author`, `too_long`, `empty`.

## Notifications (spec 012)

- `sheet_mention` and `sheet_reply` follow spec 012's channels and settings, and both appear in Notification settings.
- `task_id` is null.
- **Deep link:** `/sheets/<folderId>?sheet=<sheetId>&cell=<rowKey>:<colKey>`.
