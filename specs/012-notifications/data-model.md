# Data Model: Task Notifications

Applied with `prisma db push` (`scripts/migrate.sh`). Every change is additive: new tables, and new columns that are nullable or have defaults. Existing entities are reused (spec §5): members, tasks, stages, comments and attachments.

## 1. New tables

### `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `recipient_id` | uuid → members, cascade | |
| `kind` | text | One of `comment`, `reply`, `attachment`, `task_created_in_stage`, `task_moved_to_stage`, `assigned`, `mention`, `due_soon`, `overdue` (`NotificationKind` in `src/types`) |
| `task_id` | uuid → tasks, **set null** | Null after the task is deleted: the row stays in history (spec edge case) |
| `comment_id` | uuid → task_comments, set null | Comment, reply and mention targets |
| `attachment_id` | uuid → task_attachments, set null | Attachment target (the newest file in a group) |
| `stage_id` | text null | Moves, new tasks and due reminders |
| `actor_ids` | uuid[] | Newest first, at most 10. Empty for due reminders |
| `count` | int, default 1 | Events in the group |
| `group_key` | text null | R5. Null means never grouped |
| `first_event_at` | timestamptz | The start of the 2-hour window |
| `last_event_at` | timestamptz | Sort order, and the relative time shown |
| `meta` | jsonb | `{ task_name, snippet?, paste_count?, due_date? }` |
| `read_at` | timestamptz null | Null means unread |
| `pushed_at` | timestamptz null | When the last phone alert was sent |
| `emailed_at` | timestamptz null | When the instant email was sent |
| `email_tries` | int, default 0 | |
| `created_at`, `updated_at` | timestamptz | |

**Indexes:**
- `(recipient_id, read_at, last_event_at desc)`: the unread count, and the Unread tab;
- `(recipient_id, last_event_at desc)`: the All tab and the page;
- `(recipient_id, group_key)` where `read_at is null`: finding an open group;
- `(read_at)` where `read_at is not null`: the 90-day clean-up.

### `task_followers`

| Column | Type | Notes |
|---|---|---|
| `task_id` | uuid → tasks, cascade | PK with `member_id` |
| `member_id` | uuid → members, cascade | |
| `followed_at` | timestamptz | |
| `muted` | bool, default false | A deliberate unfollow, or "Turn off notifications for this task" (R3) |

### `notification_settings`

Rows exist only where a member changed a default (FR-041 defaults live in code).

| Column | Type | Notes |
|---|---|---|
| `member_id` | uuid → members, cascade | PK with `kind` |
| `kind` | text | `NotificationKind` |
| `in_app` | bool | |
| `push` | bool | |
| `email` | bool | |

### `push_subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `member_id` | uuid → members, cascade | |
| `endpoint` | text, unique | |
| `p256dh`, `auth` | text | |
| `user_agent` | text null | Shown as "This phone" or "Chrome on Mac" in settings |
| `created_at`, `last_ok_at` | timestamptz | |

### `due_reminders`

PK `(task_id, kind, due_date)`. `task_id` → tasks, cascade. `kind` is `due_soon` or `overdue`. It records that a reminder was sent, so each is sent once per task, kind and due date (FR-050).

### `email_digests`

PK `(member_id, day date)`, with `sent_at`. It records that the daily summary was sent, so it goes out once a day.

## 2. New columns on existing tables

| Table | Column | Type | Why |
|---|---|---|---|
| `task_comments` | `parent_id` | uuid null → task_comments, cascade | Replies, one level (R4). Index `(parent_id)` |
| `tasks` | `description_mentions` | uuid[], default `{}` | @mentions in the description (R11) |
| `members` | `locale` | text, default `'en'` | Push and email language (R13) |
| `members` | `gender` | text null (`'f'`, `'m'`) | Arabic verb agreement (R6) |
| `members` | `notify_dnd` | bool, default false | Do not disturb (FR-040) |
| `members` | `email_mode` | text, default `'daily'` (`'instant'`, `'daily'`, `'off'`) | FR-040, FR-041 |
| `members` | `last_active_at` | timestamptz null | "Active" for toasts and push (R7, R8) |

**Unchanged:** `mention_reads` is kept but no longer read or written (R12).

## 3. Types (`src/types/index.ts`, written first, §VI)

```ts
export type NotificationKind = 'comment' | 'reply' | 'attachment' | 'task_created_in_stage'
  | 'task_moved_to_stage' | 'assigned' | 'mention' | 'due_soon' | 'overdue'
export type NotificationChannel = 'in_app' | 'push' | 'email'
export type EmailMode = 'instant' | 'daily' | 'off'
export interface AppNotification {
  id: string; kind: NotificationKind; taskId: string | null; commentId: string | null; attachmentId: string | null
  stageId: string | null; actorIds: string[]; count: number; meta: { task_name: string; snippet?: string; paste_count?: number; due_date?: string }
  read: boolean; lastEventAt: string
}
```

## 4. Default settings (FR-041)

| Kind | In the app | Phone | Email |
|---|---|---|---|
| mention, assigned, due_soon, overdue | on | on | off |
| comment, reply, attachment, task_created_in_stage, task_moved_to_stage | on | off | off |

The email mode starts at `daily`, and DND starts off.

## 5. Recipients (FR-001, R2)

| Kind | Recipients, before removing the actor, duplicates, muted followers and kinds turned off |
|---|---|
| comment | assignee, owner, creator, followers |
| reply | the parent's author, the other repliers in the thread, followers |
| attachment | assignee, owner, creator, `stageHolders(task)`, followers |
| task_created_in_stage | `stageHolders(task)` |
| task_moved_to_stage | `stageHolders(task in its new stage)` |
| assigned | the new assignee |
| mention | each newly mentioned member (ignores mutes) |
| due_soon, overdue | assignee, `stageHolders(task)` (respects mutes) |

## 6. Launch steps (`scripts/backfill.sh`, idempotent)

1. **Followers.** Seed them for live tasks: creator, owner, assignee, and every comment author.
2. **Mentions.** Turn each unread mention from the last 7 days (not in `mention_reads`) into a `mention` notification, keyed so it runs once.
3. **Locale.** Every member starts at `en`, and their first visit corrects it.
