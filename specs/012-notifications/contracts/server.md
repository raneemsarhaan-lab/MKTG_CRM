# Server Contract: Task Notifications

These are server actions (`src/actions/notifications.ts`, `'use server'`) and a few route handlers. Every one acts only for the signed-in member, and returns `{ success: false, error: 'not_authenticated' }` without a session.

## Actions

| Action | Input | Returns | Notes |
|---|---|---|---|
| `listNotifications` | `{ tab: 'all' \| 'unread', before?: string (last_event_at cursor), limit = 20, kinds?: NotificationKind[], from?: date, to?: date }` | `{ items: AppNotification[], next: string \| null, actors: { id, name, avatar_url, gender }[] }` | Newest first. The cursor is `(last_event_at, id)`, so there are no gaps or duplicates (US4). `kinds`, `from` and `to` serve the full page (FR-035) |
| `markNotification` | `id, read: boolean` | `{ unread }` | Mark read or unread (FR-032) |
| `markAllRead` | none | `{ unread: 0 }` | FR-033 |
| `openNotification` | `id` | `{ target: { taskId, commentId?, section? } \| null }` | Marks it read. `null` means "This task is no longer available" (FR-034) |
| `getNotificationSettings` | none | `{ kinds: Record<kind, { in_app, push, email }>, emailMode, dnd, emailReady: boolean, devices: { id, label, created_at }[] }` | Defaults are merged in (data-model §4) |
| `saveNotificationSettings` | `Partial<{ kinds, emailMode, dnd }>` | `{ success }` | It saves only the settings that differ from the defaults |
| `setFollow` | `taskId, follow: boolean` | `{ following }` | `follow=false` sets `muted` (R3) |
| `getFollow` | `taskId` | `{ following }` | Used by the toggle in the task panel |
| `muteTaskNotifications` | `taskId` | `{ success }` | "Turn off notifications for this task" (FR-032) |
| `setLocale` | `'en' \| 'ar'` | `{ success }` | Stores `members.locale` (R13) |

## Route handlers

| Route | Method | Body / response | Notes |
|---|---|---|---|
| `/api/notifications/pulse` | GET `?v=<nonce>&active=0\|1` | `{ unread, latest: { id, last_event_at }[] }` | `Cache-Control: no-store`. With `active=1` it sets `last_active_at` (R7) |
| `/api/notifications/push` | POST `{ subscription }` / DELETE `{ endpoint }` | `{ success }` | Saves or removes this device's subscription (FR-090, FR-093) |
| `/api/notifications/push/key` | GET | `{ publicKey }` | The public VAPID key |
| `/api/notifications/tick` | POST, header `x-notify-secret` | `{ ran: string[] }` | A fallback trigger for the scheduler's jobs (R9). It is off unless `NOTIFY_TICK_SECRET` is set |

## Changes to existing actions

| Action | Change |
|---|---|
| `addComment(taskId, body, mentions, taskRefs, parentId?)` | Adds `parentId` (R4). It calls `notify` for a comment or reply, plus mentions, and auto-follows the author |
| `updateTask(id, patch)` | `patch.description_mentions?: string[]`. A changed `assignee_id` notifies `assigned`, and new description mentions notify `mention` |
| `setTaskStage`, `moveTask` | `task_moved_to_stage` to the new stage's holders |
| `bulkUpdateTasks` | Per task: a move, an assignment, or both. They are grouped where the kind allows |
| `createTask`, `createTasks`, `createSubtask`, `createTaskInProject`, `addPiece`, `addClips`, `addPlan` | `task_created_in_stage`, plus `assigned` when an assignee is set. Pastes (`addClips`, `addPlan`) send one notification per stage holder per paste |
| `addAttachments`, `addLinkAttachment`, `setPieceLink`, `/api/attachments` | `attachment`, grouped |
| `replyToMention` | Becomes a reply (`parentId` = the mentioning comment) |
| `markMentionsRead` | Removed (R12) |
| sign-out (`/api/logout`) | Deletes this device's push subscription when its endpoint is sent along |

## Errors

| Code | Meaning |
|---|---|
| `not_found` | The notification isn't the caller's |
| `bad_parent` | The reply's parent is on another task, or is itself a reply |
| `email_not_ready` | Email is switched on for a kind while Resend isn't configured. The switch is saved, and the UI shows the note |
