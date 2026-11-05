# UI contract: the Inbox

## 1. Host interface (`src/components/inbox/types.ts`)

```ts
interface InboxApi {
  move(taskId: string, to: StageId): Promise<MoveTaskResult>          // board's moveTo
  comment(taskId: string, body: string, mentions: string[]): Promise<{ success: boolean; error?: string }>
  setDate(taskId: string, isoDate: string): Promise<{ success: boolean; error?: string }>
  snooze(taskId: string, until: string): Promise<{ success: boolean; error?: string }>
  unsnooze(taskIds: string[]): Promise<{ success: boolean; error?: string }>
  markRead(commentIds: string[]): Promise<{ success: boolean; error?: string }>
  reply(commentId: string, body: string): Promise<{ success: boolean; error?: string }>
  setPrefs(p: { pinned?: boolean; showWeek?: boolean }): Promise<{ success: boolean; error?: string }>
  openTask(taskId: string, opts?: { commentId?: string }): void
}
```

The board owns the state:
- tasks;
- `InboxState`, updated optimistically and rolled back on failure.

`InboxButton` and `InboxPanel` are pure views over `inboxModel(...)`, plus their own UI state (the open tab, a row's note or date editor, a row's error).

## 2. Inbox button (`data-inbox-button`)

| State | Look | Accessible name |
|---|---|---|
| total > 0 | Filled `INBOX_UI.purple` pill, 50 px tall. Tray icon, with the badge on its inline-end top corner (lime; orange when urgent), cut out by a 2.5 px ring in the button colour. "Inbox", and a summary line under it. | "Inbox, {todo} to do, {unread} unread mentions" |
| total = 0 | Outlined white pill. Tray icon, "Inbox", "All clear". No badge. | "Inbox, all clear" |
| open | Fill `INBOX_UI.ink`. | `aria-expanded="true"` |

Behaviour:
- **Badge:** shows `99+` above 99.
- **Ring:** `.is-ring` adds a pulse that plays 3 times (R9). Not under `prefers-reduced-motion`.
- **Phone:** under 768 px the summary line is hidden.

## 3. Panel (`role="dialog"`, `aria-label="Inbox"`, `data-inbox-panel`)

- **Heading:** "Inbox", with the counts line under it (FR-017).
- **Tools:**
  - Pin (`aria-pressed`, "Keep the Inbox open beside the board");
  - Close (✕).
- **Tabs:** a `role="tablist"` with To do, Mentions, Team and Done. Arrow keys, Home and End move between tabs, and the selected tab is in the tab order. Counts:
  - To do: `todo`;
  - Mentions: "{n} new", or nothing;
  - Done: the number of tasks published this week.
- **Opening tab:** To do; otherwise Mentions; otherwise Team (FR-016).
- **Closing:**
  - Esc and ✕ close it;
  - so does a mousedown outside the panel and button, unless pinned;
  - focus then returns to the button.
- **Pinned:** the panel renders in the board's side column (`data-pinned`). Outside clicks are ignored.

### Rows

- Each row is a `role="group"` with a main button, `data-row="{kind}:{id}"`, that opens the task (FR-019).
- Action buttons sit after the main button, on their own line in the panel.

| Kind | Content | Actions (only when allowed) |
|---|---|---|
| review | Name; stage pill; "Waiting {n} days"; due words; SLA chip | Approve →, Send back (opens a note box: Send back / Cancel) |
| yours | Name; stage pill; reason ("2 days late", "Due today", "No due date") | Set date (date input + Save), Move on →, Tomorrow |
| mention | Unread dot; author avatar and name; "mentioned you"; age; task name; quoted body | Reply box + Reply; Mark read (unread only) |
| team | Kind icon; line; task name; date words | — (the row opens the task; comments open at the comment) |
| done | Check icon; name; "Published {date words}" | — |

Group headings in To do:
- "Waiting for your review · n";
- "Your tasks · n";
- a "Put off until tomorrow · n · Bring back" line when n > 0.

**Errors**: `role="alert"` text under the row: "That didn't work. Try again." The move errors have their own messages:
- "Already moved" (refreshes);
- "You can't move this one".

## 4. View menu (`data-view-menu`)

- A "View" button (`aria-haspopup="menu"`, `aria-expanded`) at the end of the filters row.
- It opens a menu with two `menuitemcheckbox` items:
  - "Show your week";
  - "Columns before design".

## 5. Board layout

- **No Inbox open, Show your week off:** the filters row and the pipeline follow the header directly (FR-004).
- **Pinned:** `.fx-board-split` holds the board and a 420 px panel column. Under 900 px the panel stacks above the board.
