# Research: Task Notifications

Each entry gives the decision, the reasons, and the options set aside. The facts about today's code come from reading main at merge 2f91d11:
- `prisma/schema.prisma`;
- `src/actions/tasks.ts`, `content.ts` and `inbox.ts`;
- `src/lib/stage-moves.ts` and `inbox.ts`;
- `src/components/inbox/*` and `kanban/TaskModal.tsx`;
- `brief-editor/extensions.ts`;
- `src/app/manifest.ts`, `src/middleware.ts`, `scripts/start.sh`, `src/i18n/request.ts`.

## R1. One central `notify()` that each action calls

**Decision.** `src/lib/notify/notify.ts` exports `notify(db, event)`. Every action that causes an event calls it inside its own transaction, after its write:

| Action | Events |
|---|---|
| `addComment` | comment, mention, auto-follow |
| `addComment` with `parentId` (new) | reply, mention |
| `addAttachments`, `addLinkAttachment`, `setPieceLink`, the upload route | attachment |
| `createTask`, `createTasks`, `createSubtask`, `createTaskInProject`, `addPiece`, `addClips`, `addPlan` | task created in a stage, assignment |
| `setTaskStage`, `moveTask`, `bulkUpdateTasks` (status) | task moved into a stage |
| `updateTask` and `bulkUpdateTasks` (assignee, description) | assignment, mention in a description |
| `replyToMention` (Inbox) | reply |

`notify()` runs these steps:
1. **Resolve recipients.** A pure function, `resolveRecipients()`.
2. **Drop** the actor, duplicates, and muted followers. Mentions and assignments ignore mutes.
3. **Read each recipient's settings**, and drop anyone with the kind off in the app.
4. **Group or insert** (R5).
5. **Queue delivery.** After the transaction commits, push to anyone not active (R8).

The resolving, grouping and sentence building are pure modules, so the lab can check them in Node.

**Why.** It meets FR-001 to FR-005. One place decides recipients, so the "one per person" and "never yourself" rules can't drift between actions. Running inside the action's transaction means a failed action records nothing.

**Alternatives.**
- **Database triggers.** They can't read the member's settings or the stage-holder rule. Rejected.
- **A queue table drained later.** It adds latency and a worker for every event. Delivery uses the queue idea only for email (R10).

## R2. "Stage holders" means the existing `holdsStage` rule

**Decision.** `stageHolders(task, members)` returns every member for whom `holdsStage(task, member)` is true. That is every member with the stage's `owner_role` on review stages, and otherwise the task's assignee, or its owner when there is no assignee. It is used for:
- task created in a stage;
- task moved into a stage;
- attachments (the current stage);
- due dates.

**Why.** Stage owners are roles in this app (`stages.owner_role`, `STAGE_META`). `holdsStage` already decides who may move a task, so notifications and permissions agree (FR-002).

## R3. Following: one table, with "muted" for deliberate opt-outs

**Decision.** New table `task_followers (task_id, member_id, followed_at, muted bool)`.
- **Automatic follow** (create, assigned, comment, mentioned) is an upsert that never clears `muted`. One exception: the member's own new comment, or a new assignment or mention of them, clears it (FR-013).
- **Follow / Following** sets or clears `muted`.
- **"Turn off notifications for this task"** sets `muted`.
- **Muted** means no comment, reply, attachment, move or due notifications for that task. Mentions and assignments always go through.
- **Seeding at launch:** each live task's creator, owner and assignee, plus every commenter.

**Why.** A row with `muted` remembers a deliberate unfollow, so the next automatic follow doesn't undo it.

## R4. Replies: `parent_id` on the existing comments

**Decision.** `task_comments.parent_id uuid null`, which references `task_comments.id` and is deleted with its parent. Threads are one level deep:
- "Reply" on a reply stores the top comment as its parent.
- `addComment(taskId, body, mentions, taskRefs, parentId?)` checks that the parent belongs to the same task and is itself a top-level comment.
- In the task panel, replies show under their comment, oldest first.
- The Inbox's `replyToMention` becomes a reply to that comment.

**Why.** It reuses the comment entity (spec §5 asks not to duplicate) and keeps mentions, task links and attachments-by-comment working.

## R5. Grouping: an open group row per recipient, kind and task

**Decision.** Comment, reply and attachment notifications get a `group_key`:

| Kind | `group_key` |
|---|---|
| comment, attachment | `${kind}:${task_id}` |
| reply | `reply:${task_id}:${parent_comment_id}` |
| task created in a stage, from a paste | `created:${stage}:${paste_id}`, so a paste gives one notification |

Inside the transaction, under `pg_advisory_xact_lock(hashtext(recipient || group_key))`:
- `notify()` looks for an **unread** row with that recipient and key, whose `first_event_at` is no more than 2 hours old;
- if found, it **updates** the row:
  - `actor_ids`: the new actor first, no duplicates, at most 10 kept;
  - `count` += n;
  - `last_event_at` = now;
  - the snippet, the target comment or attachment, and `updated_at`;
- otherwise it **inserts** a new row.

Mentions, assignments and due reminders have no `group_key`.

**Why.** It meets FR-020 to FR-022. The lock makes two simultaneous comments add up exactly instead of making two rows. "Read" ends a group because only unread rows are matched.

## R6. Sentences built at display time, in the reader's language

**Decision.** A notification stores facts:
- the kind;
- `actor_ids` and `count`;
- the task id, plus `meta.task_name` captured at the time, so deleted tasks still read;
- `stage_id`;
- the comment or attachment id;
- `meta.snippet` (100 characters);
- `meta.paste_count`.

`src/lib/notify/message.ts` turns a notification and a member lookup into `{ key, values }`. A new `notifications.*` namespace in both message files holds the sentences, built with ICU `plural` and `select`. The browser renders with next-intl, and the server renders push and email with next-intl's `createTranslator` for the recipient's stored locale (R13).

**Arabic grammar.**
- **The actor's gender.** Arabic verbs agree with the actor (علّق / علّقت). Members get an optional `gender` (`'f' | 'm' | null`), set in Profile and by admins in Team. With no gender, the Arabic sentences use a neutral noun phrase ("تعليق جديد من سلمى على مهمة …").
- **Counts.** ICU plural categories: zero, one, two, few, many, other.

**Why.** It meets FR-006 and FR-070. A switch of language rewrites every notification at once.

## R7. Live updates: a light "pulse" poll, not a socket

**Decision.** `GET /api/notifications/pulse` returns `{ unread, latest }`:
- `unread`: the count, from the index in data-model §1;
- `latest`: the ids and `last_event_at` of the 5 newest unread notifications.

It is `Cache-Control: no-store`, with a per-request query nonce. The client calls it:
- every 8 s while the tab is visible;
- every 60 s while it's hidden;
- right after any action of its own.

When `latest` changes, the client fetches the changed rows, updates the list, and shows a toast (FR-036).

The same call records presence: it sets `members.last_active_at` when the page is visible and the member has used it in the last 5 minutes.

**Why.**
- FR-030 asks for 10 s or less, and polling meets it.
- The app runs behind a proxy that has mishandled caching before (see `manifest.ts`). Long-lived streams through it are untested, and there is no Supabase Realtime or socket server in this deployment.
- The count query is a single index scan.

**Alternatives.**
- **Server-Sent Events.** They depend on the proxy not buffering. Kept as a later upgrade behind the same client hook.
- **WebSockets.** They need a separate server process on Cranl. Rejected for now.

## R8. Phone alerts: Web Push with a push-only service worker

**Decision.**
- **Library.** `web-push` (one new dependency, see the plan's Complexity Tracking), with VAPID keys in `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`.
- **Subscriptions.** Each device's subscription is stored in `push_subscriptions`, one row per endpoint, owned by a member.
- **The worker.** `public/push-sw.js` handles only `push` and `notificationclick`. **It has no `fetch` handler, so it never touches requests or caches (FR-094).** `src/middleware.ts` lets `/push-sw.js` through without a session, like the manifest.
- **Payload.** The server sends the rendered sentence in the recipient's locale, plus a URL and a tag:
  - the tag is the notification id, so a growing group replaces its alert (FR-092);
  - the URL is `/board?task=<id>&comment=<id>&section=attachments&n=<notification id>`, and the app marks `n` read on open (FR-034).
- **When.** After commit, if the kind is on for push, DND is off, and `last_active_at` is more than 60 s old (FR-091).
- **Expiry.** A `404` or `410` from the push service deletes that subscription (FR-093).
- **Sign-out.** The client unsubscribes and calls `DELETE /api/notifications/push`.
- **iPhone.** The offer checks `navigator.standalone` and `PushManager`. Outside the Home Screen app, it shows the add-to-Home-Screen steps instead (US11, scenario 1).

**Why.** It is the only way to reach a closed web app on Android and on iOS 16.4 and later. A worker with no fetch handler keeps the "no second caching layer" rule written in `manifest.ts`.

**Alternatives.**
- **Hand-written VAPID and payload encryption** with node `crypto`. About 200 lines of crypto. Rejected for risk.
- **Firebase Cloud Messaging.** A Google account and SDK for what the standard covers. Rejected.

## R9. Due reminders and other timed jobs: an in-process scheduler

**Decision.**
- **Where it starts.** `src/instrumentation.ts` `register()` starts `startNotifyScheduler()` on the Node runtime. It can be switched off with `NOTIFY_SCHEDULER=0`, for dev and the labs.
- **Single runner.** A 60 s tick takes `pg_try_advisory_xact_lock(hashtext('notify-scheduler'))` per job, so only one instance runs it.
- **The jobs:**

  | Job | When | What |
  |---|---|---|
  | Instant email | every tick | R10 |
  | Due reminders | hourly | Live tasks not published or archived. "Due tomorrow" when the due date is tomorrow in the team's time zone; "overdue" when it is before today. Each sent once per task, kind and due date, keyed in `due_reminders` |
  | Daily summary | 08:30 in the team's time zone | Once per member per day, keyed in `email_digests` |
  | Clean-up | daily, 03:00 | Deletes read notifications older than 90 days, `due_reminders` for past dates, and `email_digests` older than 30 days |

- **Time zone.** `NOTIFY_TZ`, defaulting to `Africa/Cairo`. Today `todayISO()` uses UTC, which is wrong around midnight in Cairo, so the notification code has its own `teamDay()`.

**Why.** Cranl runs one long-lived `next start` (`scripts/start.sh`), so an in-process timer is reliable there. The advisory lock makes it safe if a second instance is ever added. A missed hour is caught up next tick, because the reminder keys are by date, not by run.

**Alternatives.**
- **A platform cron hitting a route.** Not confirmed on Cranl. Kept as a fallback: `POST /api/notifications/tick` with a secret runs the same jobs.

## R10. Email: an HTTP provider behind one sender

**Decision.**
- **The sender.** `src/lib/notify/email.ts` sends through **Resend's HTTP API** with `fetch`, so there's no new dependency. It reads `RESEND_API_KEY` and `EMAIL_FROM`.
- **When it isn't set up.** With either value missing, the email column in settings reads "Email isn't set up yet" and nothing is queued.
- **Instant.** The tick picks notifications that meet all of these:
  - unread;
  - not yet emailed (`emailed_at` is null);
  - older than 10 minutes;
  - the kind is on for email;
  - the member's mode is Instant.

  It sends one email each, sets `emailed_at`, and retries a failed send on the next tick, up to 5 times (FR-095, FR-098).
- **Daily summary.** One email listing the member's unread notifications from the last 24 h for the kinds on for email (FR-096).
- **Templates.** Plain HTML in both languages, with `dir="rtl"` for Arabic. Every link goes to `/board?task=…&n=…` behind the normal sign-in, plus a link to Notification settings (FR-097).
- **Swapping provider.** One file changes.

**Why.** It is the simplest set-up step for the team: one key and a verified sender domain, and no SMTP library. The 10-minute delay avoids an email for something already seen in the app.

**Open.** The team confirms the provider and verifies the sender domain at deployment (quickstart §5). The code keeps the provider in that one file.

## R11. @mentions in descriptions

**Decision.**
- **Picking.** The description editor gets an `@` picker, a second Tiptap `Suggestion` beside the existing `/` menu in `brief-editor/extensions.ts`. Picking a member inserts `@Name` and records their id.
- **Saving.** `updateTask` accepts `description_mentions`. It is checked against members on the server, as `addComment` does, and stored on `tasks.description_mentions`.
- **Notifying.** Only ids that weren't there before are notified (spec edge case "Edited comments"). An edit can't mention the same person twice.

**Why.** It is the same pattern as comments: a machine-readable list beside the text, so names can't be confused or orphaned by a rename.

## R12. The Inbox after option A

**Decision.**
- **Removed from the Inbox panel:** the Mentions and Team tabs.
- **Kept:** To do (reviews and your tasks) and Done.
- **`inboxModel` counts:** `total` = `todo`, and `unread` drops out of the button's count and summary.
- **The bell.** It is a new `NotificationBell` beside the Inbox button in `BoardHeader`'s `inbox` slot, so the header gets both.
- **`markMentionsRead`.** Removed. Mention read state lives on the notification.
- **`mention_reads`.** No longer read or written. The table stays until a later clean-up, because dropping it would need `--accept-data-loss` in `db push`.
- **Launch backfill.** Each mention made in the last 7 days that isn't in `mention_reads` becomes an unread "mention" notification, once, keyed by comment id (FR-080).
- **Labs.** The inbox lab's Mentions and Team scenarios move to the notifications lab.

**Phone header.** At 390 px the top bar now holds the tabs, a search icon, the bell, the Inbox icon and the avatar. That is 4 × 44 px plus the tabs. The tabs' padding shrinks to fit, and SC-002 of spec 011 (first column ≤ 320 px) is checked again.

## R13. The member's language for push and email

**Decision.**
- **Storage.** `members.locale` (`'en' | 'ar'`, default `'en'`).
- **Updated when:**
  - the language toggle changes it (a new `setLocale` action beside the cookie);
  - on page load, if the cookie and the stored value differ.
- **Use.** Push and email render with this locale.

**Why.** Today the locale is only a cookie (`src/i18n/request.ts`), which the server can't read when no request is open.

## R14. Deep links

**Decision.** The board already opens `?task=`, and `TaskModal` takes `initialCommentId` and `initialPreviewId`.
- **New parameters:**
  - `comment=<id>`, which scrolls to the comment and highlights it with the existing `.fx-comment-flash`;
  - `section=attachments`;
  - `n=<notification id>`, which marks it read.
- **When the task can't be opened** (it is missing, or the member has no access), a small dialog reads "This task is no longer available" (FR-034).
- **Toasts** are suppressed when the event's task is the one open (`selectedTaskId`, FR-037).
