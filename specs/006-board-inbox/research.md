# Research: Board Inbox

Decisions for [plan.md](./plan.md). Each entry gives the decision, why it was chosen, and the alternatives considered.

## R1. Where the Inbox lists come from

**Decision**: Compute every list on the client, from the tasks the board already holds, in one pure function: `inboxModel(input)` in `src/lib/inbox.ts`.
- **Input:**
  - the live tasks, with their comments and attachments;
  - the member;
  - the set of read comment ids;
  - the live snoozes;
  - `inbox_since`;
  - the SLA config;
  - "now".
- **Output:** the four tabs' rows, the counts, the urgent flag and the summary parts.

**Rationale**:
- The board page already loads every task with its comments (including `mentions`) and attachments.
- A second query could only disagree with what is on screen.
- The button's number and the panel's lists come from the same call, which makes SC-002 true by construction.

**Alternatives**: a server-side `getInbox()` action. Rejected: it would duplicate the loader, need its own refresh path, and could drift from the board.

## R2. "Waiting for your review"

**Decision**: A task is waiting for the member's review when all of these hold:
- it is live (not dropped, not Published);
- its stage has an `owner_role` (C-Review, C-Check, D-Check, Final check);
- that role equals `member.role`.

Admins and superusers are not listed for stages their role doesn't own (FR-020, US2 AS5). Rows are ordered by how long they have waited (oldest `stage_date` first).
- **Waiting time** is calendar days since `stage_date`: "arrived today", "1 day", "N days".
- **SLA chip** comes from `getAlertStatus`, shown only for At Risk, Will Miss, Stuck or Overdue.

**Rationale**: This is the same holder rule as `holdsStage` in `src/lib/stage-moves.ts`, so whoever sees Approve is exactly who may approve.

## R3. "Your tasks"

**Decision**: A task is "yours" when `(assignee_id ?? task_owner_id) === member.id`. That is the board's own "Only me" rule, and the rule of the old Needs your attention card.

It is listed when all of these hold:
- it is live and not Published;
- it is in a working stage (no `owner_role`). A task sitting in a review is waiting on someone else, not on you.
- it is late, due today, or has no due date.

Order: late (most days late first), then due today, then undated (FR-022). Snoozed tasks are left out of the list and the count, and counted on the "Put off until tomorrow" line instead.

**Rationale**: The spec's "owns" means the person whose work it is. Using the assignee-first rule keeps the Inbox consistent with the board's "Only me" view.

## R4. Mention read state

**Decision**: A new table, `mention_reads (member_id, comment_id, read_at)`, unique on the pair.

A mention is **unread** when all of these hold:
- the comment's `mentions` includes the member;
- its author is not the member;
- it was written on or after `inbox_since − 7 days` (R5);
- there is no read row for the pair.

It becomes read when the member:
- replies in place;
- presses Mark read or Mark all read;
- opens the task from that mention (FR-031).

Opening the panel never marks anything.

**Rationale**: Read state must follow the member across devices (FR-033, SC-006), so it lives in the database. It is per comment, so a deleted comment simply leaves the list (the row cascades).

## R5. The 7-day launch window

**Decision**: A member field, `inbox_since timestamptz NOT NULL DEFAULT now()`. When `db push` adds the column, Postgres fills it with the time of the push for every existing member. Mentions older than `inbox_since − 7 days` count as read without needing a row (FR-034, SC-007).

**Rationale**: The rule is deterministic and needs no backfill. A one-off seed of read rows would rerun on every deploy and quietly mark later mentions read, against FR-031.

## R6. Tomorrow (put off)

**Decision**:
- A new table, `task_snoozes (member_id, task_id, until)`, unique on the pair.
- The client sends `until`, the next local midnight on the member's device (spec assumption), and the server caps it at 36 hours from now, so snoozing never hides a task for more than a day.
- A snooze is live while `until > now`. The loader reads only live snoozes.
- Bring back deletes the rows.

**Rationale**: It is per member, and must still hold after a reload on another device, so it lives in the database.

## R7. Pin and Show your week

**Decision**: Two member booleans, `inbox_pinned` and `show_week`, both off by default and set through `setInboxPrefs`. "Columns before design" keeps its existing per-device key (`momentum.board.upstream`) unchanged (FR-003).

**Rationale**: The spec says these follow the member (Assumptions). Each is a single field; a preferences table would be heavier than needed.

## R8. Actions

| Action | How |
|---|---|
| Approve / Move on → | The board's `moveTo(task, nextOnPath(task))`. It is optimistic, the server decides with `allowedStages`, and the celebration follows the board's rule. |
| Send back | `moveTo(task, previous stage on its path)`, then, if a note was written, `addComment(task, "@Owner note", [owner])`. |
| Set date | The existing `updateTask(id, { due_date })`. |
| Tomorrow / Bring back | `snoozeTask(id, until)` / `unsnoozeTasks(ids)`. |
| Reply | `replyToMention(commentId, body)`: adds a comment mentioning the author and marks the mention read, in one transaction. |
| Mark read / Mark all read / open from a mention | `markMentionsRead(ids)`. |
| Pin / Show your week | `setInboxPrefs({ pinned?, showWeek? })`. |

Each action updates local state first. If the server refuses, it rolls back, and the row shows a short message (FR-029). A move refused because the task already moved shows "Already moved", and the board refreshes.

## R9. The pulse

**Decision**:
- **When it pulses:** the ring plays three times on load when there is an unread mention or an urgent counted task whose key is not in the "seen" list.
- **What "seen" holds:** the keys of the mention and urgent items present when the member last opened the Inbox. It is stored on this device under `momentum.inbox.seen`.
- **On open:** the list is replaced, so the ring stops until something new arrives.
- **Reduced motion:** it plays no animation (FR-012d).

**Rationale**: It is a per-device presentation hint, not application data (§VI 2.1.0). It is acceptable for it to pulse once more on a second device.

## R10. Team

**Decision**: `teamItems(tasks, member)` covers tasks the member owns or is assigned to, and lists:
- comments by others that don't mention the member;
- files added by others (`uploaded_by` set and not the member);
- the current stage entry: "moved to {stage}" for an open task, "was published" for a Published one.

Stage moves and publishes carry no name or avatar, and use date-only wording ("today", "yesterday", "3d ago"), because `stage_date` is a date (FR-041). The list is newest first and capped at 40.

**Note**: There is no event log, so the member's own stage moves can't be told apart and are still listed. Spec Assumption "Approvals with no event log" covers this.

## R11. Done

**Decision**:
- **Listed:** tasks the member owns or is assigned to that are Published, with `stage_date` on or after Monday of this week, newest first.
- **Total:** the same set without the date limit.

## R12. Opening a task at a comment

**Decision**: `TaskModal` gains `initialCommentId`. Once the panel has rendered, it:
- expands the folded activity if needed;
- scrolls the comment's row (`data-comment-id`) into view;
- flashes it once.

The board passes it for Team comments and for mentions (FR-042).

## R13. Panel placement

**Decision**:
- **Unpinned:** the panel is `position: fixed`, at the inline-end edge, under the header, 440 px wide, over the board. It closes on Esc, ✕, or a mousedown outside the panel and button.
- **Pinned:** the board area becomes a two-column grid (`1fr 420px`), with the panel sticky in the second column.
  - Below 900 px, the pinned panel sits above the board (FR-061).
  - At phone width, the unpinned panel is full width.
- **Arabic:** inline-end means the left side (FR-018).

## R14. Host interface and lab

**Decision**: The Inbox components receive an `InboxApi` (approve, sendBack, moveOn, setDate, snooze, unsnooze, markRead, reply, setPrefs, openTask), as the sheets receive theirs. `scripts/inbox-lab/` follows `scripts/sheet-lab/`:
- esbuild bundles a page that mounts the real button and panel with a stub host;
- the stub decides moves with the real `allowedStages`;
- `pure.mjs` checks `src/lib/inbox.ts` in Node;
- `scenarios.mjs` drives Playwright and axe.

## R15. Strings and numbers

**Decision**:
- A new `inbox` namespace in `messages/en.json` and `messages/ar.json`, with ICU plurals.
- Counts are formatted with the locale's number formatting. Western digits stay in both languages, as in the rest of the app.

## R16. Layout cleanup

**Decision**:
- `HeroCards` loses Needs your attention, Activity feed and its own week toggle. It renders Week Momentum and Daily Spark only when `show_week` is on.
- The bell and its dropdown are removed from `KanbanBoard`.
- The "Hide what's upstream" button moves into the View menu, which sits in a trailing slot added to `BoardFilters`, at the end of the filters row.
- `home-metrics.ts` keeps its functions. `attentionItems` and `activityItems` are no longer used on the board; Overview may still use them.
