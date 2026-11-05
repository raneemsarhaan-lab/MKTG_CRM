# Data Model: Board Inbox

## 1. Schema changes (`prisma/schema.prisma`, applied with `db push`)

### `Member` (`members`): three new fields

| Field | Type | Default | Meaning |
|---|---|---|---|
| `inbox_since` | `DateTime @db.Timestamptz(6)` | `now()` | Start of the mention window. A mention older than this minus 7 days counts as read (R5). Existing members get the time of the push. |
| `inbox_pinned` | `Boolean` | `false` | The Inbox panel is pinned beside the board (FR-060). |
| `show_week` | `Boolean` | `false` | Week Momentum and Daily Spark are shown (FR-002). |

Relations added: `mention_reads MentionRead[]` and `snoozes TaskSnooze[]`.

### `MentionRead` (`mention_reads`): new

| Field | Type | Notes |
|---|---|---|
| `member_id` | `String @db.Uuid` | → `Member`, onDelete Cascade |
| `comment_id` | `String @db.Uuid` | → `TaskComment`, onDelete Cascade |
| `read_at` | `DateTime @default(now()) @db.Timestamptz(6)` | |

Primary key: `@@id([member_id, comment_id])`. `TaskComment` gains `reads MentionRead[]`.

### `TaskSnooze` (`task_snoozes`): new

| Field | Type | Notes |
|---|---|---|
| `member_id` | `String @db.Uuid` | → `Member`, onDelete Cascade |
| `task_id` | `String @db.Uuid` | → `Task`, onDelete Cascade |
| `until` | `DateTime @db.Timestamptz(6)` | Hidden from this member's Inbox while `until > now()`. |

Primary key: `@@id([member_id, task_id])`. `Task` gains `snoozes TaskSnooze[]`.

## 2. Types (`src/types/index.ts`)

```ts
export type InboxTab = 'todo' | 'mentions' | 'team' | 'done'
export type InboxReason = 'late' | 'today' | 'undated'
export interface InboxState {
  /** Comment ids this member has read (mentions only). */
  readIds: string[]
  /** Live snoozes: task id → ISO time it comes back. */
  snoozes: Record<string, string>
  /** ISO; mentions before this minus 7 days count as read. */
  since: string
  pinned: boolean
  showWeek: boolean
}
```

## 3. Derived model (`src/lib/inbox.ts`, pure)

`inboxModel({ tasks, member, state, slaConfig, now })` returns:

```ts
{
  reviews: ReviewRow[]    // R2: { task, stage, waitingDays, dueDays|null, sla|null }
  yours:   YourRow[]      // R3: { task, reason: InboxReason, days }   (snoozed excluded)
  snoozed: string[]       // task ids put off until tomorrow
  mentions: MentionRow[]  // R4: { comment, task, author, unread } — unread first, newest first
  team:    TeamRow[]      // R10
  done:    { week: DoneRow[], total: number }   // R11
  counts:  { todo, reviews, late, today, undated, unread, total, urgent }
  ringKeys: string[]      // R9: keys of unread mentions and urgent counted tasks
}
```

**Rules**:
- `counts.todo` = `reviews.length + yours.length`.
- `counts.total` = `counts.todo + counts.unread` (FR-011).
- `urgent` is true when any counted review or own task is due today or late (FR-012).

`inboxSummary(counts)` returns the parts in priority order: reviews, late, due today, new mentions. The button shows the first two; with none of these it shows "N to do", or "All clear" at zero (FR-012b, FR-012c).

`nextMidnight(now)` is the start of the next local day (R6).

`dateWords(iso, now)` returns `'today' | 'yesterday' | { days }` (R10).

## 4. Loader (`src/app/(app)/board/page.tsx`)

Adds three queries for the session member, run in parallel:
- `mentionRead.findMany({ where: { member_id }, select: { comment_id } })`;
- `taskSnooze.findMany({ where: { member_id, until: { gt: now } } })`;
- the member's own `inbox_since`, `inbox_pinned` and `show_week`.

These are passed to `KanbanBoard` as `inbox: InboxState`.
