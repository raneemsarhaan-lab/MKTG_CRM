---
description: "Task list for Task Notifications"
---

# Tasks: Task Notifications

**Input**: Design documents from `specs/012-notifications/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: As in specs 006–011, each story ends with lab checks. The new `npm run lab:notify` holds Node checks of the pure modules and Playwright scenarios with a stub host. Server behaviour is checked against the running app on local PostgreSQL (quickstart §3). Phone and email are checked against a deployed preview (quickstart §4–§5).

**Conventions**

| Term | Meaning |
|---|---|
| Notify | `src/lib/notify/` (pure: `recipients.ts`, `group.ts`, `message.ts`, `settings.ts`, `days.ts`; server: `notify.ts`, `push.ts`, `email.ts`, `scheduler.ts`) |
| Actions | `src/actions/notifications.ts` (contracts/server.md) |
| Board | `src/components/kanban/KanbanBoard.tsx` |
| Modal | `src/components/kanban/TaskModal.tsx` |
| UI | `src/components/notifications/` |
| Lab | `scripts/notify-lab/`, `npm run lab:notify` |
| Strings | `useTranslations('notifications')`, English and Arabic in the same task |
| Colours | `NOTIFY_UI` in `src/lib/tokens.ts` and `--nt-*` in `globals.css` only |

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 The design file `design/notifications.html`, built on the approved `design/notifications-options.html` (option A), following contracts/ui.md §1–§8. It shows:
  - the bell and its 9+;
  - the panel's All and Unread tabs, rows for every kind, grouped rows, the ⋯ menu, Mark all and the empty state;
  - the phone-alerts offer, including the iPhone Home Screen steps;
  - toasts;
  - the settings table (kinds × In the app / Phone / Email, the email mode, DND, this device);
  - the task panel's Follow toggle and reply threads;
  - the `/notifications` page with filters;
  - the 390 px layout and Arabic.

  Publish it as an artifact and commit it. **UI tasks start after the user approves it (§IV).**
- [X] T002 [P] Lab skeleton in `scripts/notify-lab/`, following `scripts/inbox-lab/`:
  - `build.sh`: esbuild bundles for `entry.tsx` (UI) and `pure-entry.ts` (Node);
  - `gen.mjs`: CSS from `globals.css`;
  - `fixtures.ts`: members in each role, with genders and locales; tasks in working and review stages; comments with replies and mentions; followers, some muted;
  - `pure.mjs` and `scenarios.mjs` (Playwright runner with a `MISSING_MESSAGE` trap);
  - `index.html`.

  Add `"lab:notify"` to `package.json` and `scripts/notify-lab/out/` to `.gitignore`.
- [X] T003 [P] Add the dependency `web-push` (plan, Complexity Tracking) to `package.json` and run `npm install`. Document `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_TZ`, `NOTIFY_SCHEDULER` and `NOTIFY_TICK_SECRET` in `.env.example`.

---

## Phase 2: Foundational (blocks every story)

- [X] T004 Schema in `prisma/schema.prisma` (data-model §1–§2):
  - **New models:** `Notification`, `TaskFollower`, `NotificationSetting`, `PushSubscription`, `DueReminder`, `EmailDigest`, with the indexes listed;
  - **New columns:**
    - `TaskComment.parent_id`, a self relation with cascade, plus its index;
    - `Task.description_mentions`;
    - `Member.locale`, `gender`, `notify_dnd`, `email_mode` and `last_active_at`.

  Run `npx prisma generate` and `bash scripts/migrate.sh` locally.
- [X] T005 [P] In `src/types/index.ts`, add `NotificationKind`, `NotificationChannel`, `EmailMode` and `AppNotification`. Add `notificationId`, `parentId` and `replies` to the comment type the task panel uses.
- [X] T006 [P] `NOTIFY_UI` in `src/lib/tokens.ts` (red badge, unread tint, unread dot and time, and an icon colour per kind) and the matching `--nt-*` variables in `src/app/globals.css`.
- [X] T007 [P] The `notifications.*` strings in `messages/en.json` and `messages/ar.json`:
  - **Sentences:** one per kind, as ICU messages:
    - `{actor}`, `{actor2}`, `{others, plural, …}`, `{count, plural, …}`, `{task}`, `{stage}`;
    - `{gender, select, f {…} m {…} other {…}}`, with a neutral noun phrasing for `other`;
    - the request's examples, for instance "علّقت سلمى على مهمة …" and "نقلت نرمين مهمة … إلى مرحلتك: المراجعة";
  - **Panel:** labels, tabs, menu, the empty state, "This task is no longer available";
  - **Settings:** labels, kinds, the email modes, DND, the device and iPhone steps, "Email isn't set up yet";
  - **Relative times;**
  - **Email:** subject lines and bodies.
- [X] T008 [P] Pure modules in `src/lib/notify/`:
  - `settings.ts`: `DEFAULTS` (data-model §4), and `effective(memberSettings, kind, channel)`, where off in the app means off everywhere;
  - `recipients.ts`: `stageHolders(task, members)`, built on `holdsStage` from `src/lib/stage-moves.ts`, and `resolveRecipients(event, ctx)` following data-model §5. It removes the actor, removes duplicates, drops muted followers except for mentions and assignments, and drops kinds that are off in the app;
  - `group.ts`: `groupKey(event)` and `joinOrNew(open, event, now)`, which uses the 2-hour window and the merge rules for actors and count (R5);
  - `message.ts`: `messageFor(notification, actors, locale)` → `{ key, values }` (R6), plus `relativeTime()`;
  - `days.ts`: `teamDay(now, tz)` and `dueState(task, now, tz)` → `'due_soon' | 'overdue' | null` (R9).
- [X] T009 The server service in `src/lib/notify/notify.ts` (R1, R3, R5):
  - `notify(db, event)`: resolves recipients through `recipients.ts` with the task, followers, members and settings. Then, under `pg_advisory_xact_lock(hashtext(recipient||group_key))`, it joins an open group or inserts. It returns the rows it touched, for delivery after commit;
  - `follow(db, taskId, memberId, { clearMute })` and `setMuted(db, taskId, memberId, muted)`;
  - `afterCommit(rows)`: a hook that US6 (toasts, through the pulse) and US11 (push) plug into. Until then it does nothing.
- [X] T010 Pure checks in `scripts/notify-lab/pure.mjs`:
  - **Recipients:** every kind × role from data-model §5;
  - **Grouping:** join, expiry, read starts a new group, mentions never join, and an exact count for simultaneous events (simulated);
  - **Settings:** defaults and precedence;
  - **Sentences:** EN and AR for every kind, with counts 1, 2, 3, 11 and 100, and with and without gender;
  - **`teamDay`:** around midnight in Cairo.

**Checkpoint**: The schema is applied, the pure modules are green in the lab, and the existing labs still pass.

---

## Phase 3: User Story 1: know when something happens on my tasks (P1) 🎯 MVP

**Goal**: A comment or reply notifies the assignee, owner, creator and followers once each, never the commenter. The bell's count updates within 10 s, and clicking a notification opens the exact comment.

**Independent Test**: Member A comments on a task B is assigned to. Within 10 s B's bell goes up by one. Clicking the notification opens the comment, highlighted, and the count goes down. A gets nothing.

- [X] T011 [US1] Replies (R4, FR-081) in `src/actions/tasks.ts`: `addComment(taskId, body, mentions, taskRefs, parentId?)` checks that the parent is on the same task and is a top-level comment (error `bad_parent`). A "reply to a reply" stores the top comment as its parent.
- [X] T012 [US1] In `addComment`, inside one `prisma.$transaction`:
  - create the comment;
  - `follow(author, { clearMute: true })`;
  - `notify(comment | reply)`;
  - `notify(mention)` for each mentioned member, and auto-follow them.

  `replyToMention` in `src/actions/inbox.ts` becomes `addComment(…, parentId)`.
- [X] T013 [US1] In `src/actions/notifications.ts`:
  - `listNotifications` (cursor on `last_event_at`, `id`; the All and Unread tabs; actors included);
  - `markNotification`;
  - `markAllRead`;
  - `openNotification`, which returns the target, or null when the task is gone (contracts/server.md).
- [ ] T014 [US1] The pulse:
  - `src/app/api/notifications/pulse/route.ts`: `no-store`; it returns `{ unread, latest }`, and with `active=1` sets `last_active_at` (R7);
  - `src/components/notifications/usePulse.ts`: polls every 8 s while visible, every 60 s while hidden, and immediately after the member's own actions. It shares its state through a small context.
- [ ] T015 [US1] The bell in `src/components/notifications/NotificationBell.tsx` (contracts/ui.md §1). Render it beside the Inbox button in the header's `inbox` slot in Board, for every view.
- [ ] T016 [US1] The panel in `src/components/notifications/NotificationPanel.tsx` and `NotificationRow.tsx` (contracts/ui.md §2):
  - rows with avatars, the kind icon, the sentence built with `message.ts` and next-intl, the snippet, the time, the dot and the tint;
  - the All and Unread tabs;
  - Mark all;
  - a click calls `openNotification`, then the deep link.
- [ ] T017 [US1] Deep links (R14):
  - Board reads `comment`, `section` and `n` from the address, and passes `initialCommentId` and `initialSection` to Modal;
  - Modal scrolls to the comment and flashes it, or opens Attachments;
  - `n` is marked read;
  - for a missing task, a dialog reads "This task is no longer available".
- [ ] T018 [US1] Replies in Modal:
  - "Reply" under each comment, and a thread composer with the existing @mention picker;
  - replies shown under their comment, oldest first;
  - the loader includes `parent_id`.
- [ ] T019 [US1] Lab scenarios `n1-*`:
  - the bell's count and 9+;
  - the panel's rows and click (the stub host records `openNotification` and the deep link);
  - mark read and unread;
  - the "no longer available" dialog;
  - the reply composer and thread order.

**Checkpoint**: the MVP. Comments and replies notify the right people, the bell updates live, and clicks land on the comment.

---

## Phase 4: User Story 2: work entering my stage, assignments and mentions (P1)

**Goal**: New tasks and moves notify the stage holders. Assignments notify the new assignee. @mentions in comments and descriptions always notify, and make the person follow the task.

**Independent Test**:
- A move into a review stage notifies every member with that role once, and never the mover.
- An assignment notifies only the new assignee.
- A mention of a non-follower notifies them, and they now follow the task.

- [X] T020 [US2] Moves in `src/actions/tasks.ts`: `setTaskStage`, `moveTask` and `bulkUpdateTasks` (status) call `notify(task_moved_to_stage)` to the new stage's holders inside the move's transaction. The previous holders get nothing more unless they follow the task (FR-012).
- [X] T021 [US2] New tasks:
  - `createTask`, `createTasks` and `createSubtask` in `src/actions/tasks.ts`, `createTaskInProject` in `src/actions/projects.ts`, and `addPiece` in `src/actions/content.ts` call `notify(task_created_in_stage)`. If an assignee is set they also call `notify(assigned)`, and they follow the creator and the assignee;
  - `addClips` and `addPlan` send one notification per stage holder per paste (`meta.paste_count`, a `group_key` per paste).
- [X] T022 [US2] Assignments: `updateTask` and `bulkUpdateTasks` call `notify(assigned)` when `assignee_id` changes to someone else, and follow the new assignee with `clearMute`.
- [ ] T023 [US2] Mentions in descriptions (R11):
  - an `@` `Suggestion` in `src/components/kanban/brief-editor/extensions.ts` with a member list, inserting `@Name` and collecting ids;
  - the description save passes `description_mentions`;
  - `updateTask` checks the ids against members, stores them on `tasks.description_mentions`, and notifies only the newly added ones.
- [ ] T024 [US2] Lab checks:
  - recipients for create, move, assign and mention across the working and review stages;
  - a stage with no holder gives no recipients;
  - an `@` picker scenario in the brief lab (`scripts/brief-editor-lab`).

---

## Phase 5: User Story 3: a calm list (P1)

**Goal**: Comments, replies and attachments on one task group within 2 hours, until the group is read.

**Independent Test**: Five comments by three people within two hours give one unread row: "X, Y and 3 others commented…". After it is read, a sixth comment starts a new row.

- [X] T025 [US3] Attachments: `addAttachments`, `addLinkAttachment`, `setPieceLink` and the `/api/attachments` upload route call `notify(attachment)`. Several files in one action add to the count at once.
- [ ] T026 [US3] Grouped rows in the panel: two stacked avatars; "{actor}, {actor2} and {others} others…"; "added {count} attachments".
- [ ] T027 [US3] Lab: grouping across comment, reply (keyed per thread) and attachment kinds; the grouped sentences in both languages; and the running-app check of five comments by three people (quickstart §3, row 3).

---

## Phase 6: User Story 4: look through, mark and silence (P2)

**Goal**: Older notifications load as the list scrolls. A row can be marked read or unread, a task can be turned off, Mark all works, and the empty state shows when nothing is unread.

**Independent Test**: With 45 notifications, scrolling loads them all with no gaps. Mark all sets the badge to 0. Turning a task off stops its notifications, except mentions and assignments.

- [ ] T028 [US4] Infinite scroll in the panel, with an `IntersectionObserver` sentinel and the cursor from `listNotifications`. On the Unread tab, a row marked read stays visible, dimmed, until the tab is reopened.
- [ ] T029 [US4] The ⋯ menu on each row: "Mark as read" or "Mark as unread", and "Turn off notifications for this task" (`muteTaskNotifications`). Keyboard: Shift+F10 and the ⋯ button.
- [ ] T030 [US4] Lab scenarios `n4-*`: 45 rows load across pages with no duplicates; Mark all; the empty state; mark unread brings the dot back; a muted task gets no comments but still gets a mention.

---

## Phase 7: User Story 5: follow and unfollow a task (P2)

**Goal**: People follow tasks automatically when they create, are assigned, comment or are mentioned. A Follow / Following toggle on each task lets them change it.

**Independent Test**: Follow a task you have no role on: you're told about its next comment. Unfollow it: you aren't told about the one after.

- [ ] T031 [US5] `setFollow` and `getFollow` in Actions, and the Follow / Following toggle in Modal's header (`data-follow`).
- [X] T032 [US5] Seed followers in `scripts/backfill.sh` (idempotent): for live tasks, the creator, owner, assignee and every comment author (data-model §6).
- [ ] T033 [US5] Lab: the toggle's state; auto-follow doesn't clear a deliberate unfollow, except for the member's own new action (FR-013).

---

## Phase 8: User Story 6: toasts while I'm working (P2)

**Goal**: A new notification shows a toast for 5 seconds while the member is active, except for the task they have open or while Do not disturb is on.

**Independent Test**: A new notification shows a toast for about 5 s. There is none for the open task, and none with DND on, though the list still updates.

- [ ] T034 [US6] Toasts in `src/components/notifications/NotificationToasts.tsx` (contracts/ui.md §3), driven by changes to the pulse's `latest`:
  - one at a time, with "and N more";
  - 5 s, paused while hovered;
  - a click follows the deep link;
  - none for `selectedTaskId`, and none with DND on.
- [ ] T035 [US6] Lab scenarios `n6-*`: timing, the open task, DND, "and 2 more", and not announced twice for the same id.

---

## Phase 9: User Story 7: due soon and overdue (P2)

**Goal**: The assignee and the stage holders hear once when a task is due tomorrow, and once when it's overdue.

**Independent Test**: A task due tomorrow gives one "due tomorrow" within an hour. Running the check again sends nothing new. After the date passes, one "overdue" is sent.

- [X] T036 [US7] The scheduler in `src/lib/notify/scheduler.ts`:
  - `startNotifyScheduler()` ticks every 60 s, and each job is guarded by `pg_try_advisory_xact_lock(hashtext('notify-scheduler:'+job))`;
  - the hourly due job uses `dueState` and keys `due_reminders` by (task, kind, due date);
  - the daily clean-up at 03:00 (FR-060).

  `src/instrumentation.ts` starts it on the Node runtime unless `NOTIFY_SCHEDULER=0`. `src/app/api/notifications/tick/route.ts` is the secret-guarded fallback.
- [ ] T037 [US7] Lab and running app: `dueState` around midnight in Cairo; running the tick twice sends one reminder; a new due date resets it; archived and published tasks are skipped.

---

## Phase 10: User Story 10: in my language (P2)

**Goal**: Every notification reads in the reader's language, built at display time, with correct Arabic grammar and right-to-left layout.

**Independent Test**: Switching the language rewrites every existing notification, with correct counts and gender.

- [ ] T038 [US10] The stored locale (R13): a `setLocale` action. `src/components/shared/LangToggle.tsx` calls it as well as setting the cookie. On page load, the stored value is corrected if it differs from the cookie.
- [ ] T039 [US10] Gender for Arabic grammar (R6): a gender field in Profile (`src/components/shared/UserMenu.tsx`, profile panel) and in the Settings → Team member form. Members without one get the neutral phrasing.
- [ ] T040 [US10] Lab: every kind in Arabic with counts 1, 2, 3, 11 and 100 and both genders; RTL layout of the panel, toasts and settings; axe in both languages.

---

## Phase 11: User Story 11: alerts on my phone when Momentum is closed (P2)

**Goal**: Phone alerts reach members with Momentum closed, for the kinds they chose, and never duplicate a toast.

**Independent Test**: On Android, with alerts allowed and the app closed, a mention shows an alert within a minute, and tapping it opens the comment. The same on an iPhone from the Home Screen. With the app open, only a toast.

- [X] T041 [US11] The worker in `public/push-sw.js`: handles only `push` (show the notification with its title, body and `tag` = notification id, and `renotify` for group updates) and `notificationclick` (focus or open the URL). **No fetch handler.** `src/middleware.ts` lets `/push-sw.js` through without a session.
- [X] T042 [US11] The server side in `src/lib/notify/push.ts`:
  - `web-push` with VAPID;
  - send to every subscription of the recipient;
  - delete a subscription on 404 or 410.

  Routes `src/app/api/notifications/push/route.ts` (POST and DELETE) and `push/key/route.ts`. `afterCommit` pushes when the kind is on for the phone, DND is off, and `last_active_at` is more than 60 s old (FR-091). The payload is rendered in the member's locale with `createTranslator`.
- [ ] T043 [US11] The offer in `src/components/notifications/PushOffer.tsx`, in the panel and in settings:
  - feature detection;
  - the iPhone check (`navigator.standalone`), showing the Home Screen steps;
  - permission asked only after a tap;
  - subscribe and POST; turn off and DELETE.

  Sign-out unsubscribes this device.
- [ ] T044 [US11] Lab and devices:
  - lab: the offer's states, including the iPhone outside the Home Screen app (stubbed `PushManager`);
  - running app: an active member gets no push;
  - quickstart §4 on a real Android phone and iPhone.

---

## Phase 12: User Story 8: choose what I'm told about (P3)

**Goal**: Each member turns each kind on or off for each channel, chooses the email mode, and can switch on Do not disturb.

**Independent Test**: Turn "New attachment" off in the app: attachments no longer appear in the bell. Turn "Mention" off for the phone: mentions still appear in the bell but don't buzz the phone. Set email to Off: no emails.

- [X] T045 [US8] `getNotificationSettings` and `saveNotificationSettings` in Actions (rows only for changes from the defaults; DND; email mode).
- [ ] T046 [US8] The settings page at `src/app/(app)/notifications/settings/page.tsx` and `src/components/notifications/NotificationSettings.tsx` (contracts/ui.md §6):
  - the kinds × channels table;
  - "In the app" off switches the row off;
  - the email mode, with the "not set up" note;
  - DND;
  - this device (`PushOffer`);
  - instant saving.

  Linked from the panel's foot and from the user menu.
- [ ] T047 [US8] Lab scenarios `n8-*`: defaults for a new member, switching a row off, the note when email isn't set up, keyboard, Arabic, and phone width.

---

## Phase 13: User Story 9: the full history (P3)

**Goal**: A Notifications page lists the whole history, with filters by kind and by date.

**Independent Test**: Filter by Mentions and Last 7 days: only that week's mentions show, newest first.

- [ ] T048 [US9] The page at `src/app/(app)/notifications/page.tsx` and `src/components/notifications/NotificationsPage.tsx`: kind chips, date ranges, the same rows, and infinite scroll (`listNotifications` with `kinds`, `from` and `to`).
- [ ] T049 [US9] Lab: filters by kind and date; rows open their targets.

---

## Phase 14: User Story 12: notifications by email (P3)

**Goal**: Instant emails for notifications still unread after 10 minutes, or one daily summary at 08:30, in the member's language.

**Independent Test**: Instant: a mention unread for 10 minutes sends one email, and one read sooner sends none. Daily summary: one email the next morning, or nothing when nothing is unread.

- [X] T050 [US12] The sender in `src/lib/notify/email.ts`:
  - Resend over `fetch`;
  - `emailReady()`;
  - EN and AR HTML templates (`dir="rtl"`) with links to `/board?task=…&n=…` and to settings.
- [X] T051 [US12] Scheduler jobs:
  - **Instant** (every tick): unread, not yet emailed, older than 10 minutes, the kind on for email, mode `instant`. It sets `emailed_at`, and retries up to 5 times;
  - **Daily summary** at 08:30 `NOTIFY_TZ`: once per member per day, through `email_digests`, and nothing when nothing is unread.
- [ ] T052 [US12] Lab: template rendering in both languages; the job selection rules with a fake clock. Then quickstart §5 with Resend configured.

---

## Phase 15: The Inbox after option A (R12)

- [ ] T053 Inbox changes in `src/lib/inbox.ts`, `src/components/inbox/InboxPanel.tsx`, `InboxButton.tsx` and `src/components/inbox/types.ts`:
  - remove the Mentions and Team tabs, and `markMentionsRead`;
  - counts: `total` = `todo`, and the summary without mentions.

  Update `InboxTab` in the types. Update `scripts/inbox-lab` scenarios to To do and Done.
- [X] T054 Launch backfill in `scripts/backfill.sh`: unread mentions from the last 7 days (not in `mention_reads`) become `mention` notifications, once, keyed by comment id (data-model §6).
- [ ] T055 The phone top bar with both buttons: shrink the tab padding so the tabs, search icon, bell, Inbox icon and avatar fit at 390 px. Re-run `lab:header` h5 (first column ≤ 320 px, targets ≥ 44 px).

---

## Phase 16: Polish and validation

- [ ] T056 Run every lab: `lab:notify`, `lab:inbox`, `lab:header`, `lab:sheet`, `lab:attachments` and `lab:brief`. Then `npm run typecheck`, `bash scripts/preflight.sh` and `npx next build`.
- [ ] T057 Running-app checks, all 12 rows of quickstart §3, with two members on local PostgreSQL and the scheduler on. Record them in `specs/012-notifications/validation.md`.
- [ ] T058 Phone and email checks, quickstart §4–§5, on a deployed preview with VAPID keys and Resend set. Record them in `validation.md`. If the keys or the provider aren't available yet, record this as "not yet checked" with the set-up steps.
- [ ] T059 [P] Docs:
  - `specs/012-notifications/constitution-check.md`, including the `web-push` dependency for sign-off and the note on the constitution's out-of-date stack table;
  - a "Notifications" section in `HANDOVER.md`: files, `notify()`, recipients, grouping, channels, scheduler, environment variables, and the Cranl set-up for VAPID and Resend;
  - a note on spec 006 (Mentions and Team moved to the bell);
  - mark this file's tasks [X].
- [ ] T060 Commit and push. Open a PR titled "Task notifications: bell, replies, phone alerts and email (spec 012)" and ask the user before merging.

---

## Progress and as-built notes (2026-11-08)

**Done.** The design file, and everything that isn't a screen:
- the schema, types, tokens and strings;
- the pure modules and `notify()`;
- every trigger: comments and replies, mentions in comments and descriptions (server side), moves, new tasks, pastes, assignments, attachments and links;
- the actions and routes: pulse, push, key, tick;
- the push-only worker;
- the scheduler: due reminders, instant email, daily summary, clean-up;
- the email sender and templates;
- the launch backfill.

**Partly done:**
- **T014:** the route is done; the client hook comes with the UI.
- **T023:** the server side (`description_mentions` in `updateTask`) is done; the `@` picker is UI.
- **T038:** the `setLocale` action is done; `LangToggle` is UI.

**Waiting for design approval:** every UI task (§IV).

**As built, against the plan:**
- **`notifyAfter()`.** Actions call it right after their own write succeeds, so notifications run in a transaction of their own instead of inside the action's. A failure is logged and never reaches the member (FR-098).
- **Working-stage holders.** "Stage holders" uses `holdsStage` exactly. For a working stage that means the assignee **and** the owner.
- **Pastes** (`createTasks`, `addClips`, `addPlan`) send one `task_created_in_stage` per stage holder per paste, keyed `list:` / `clips:` / `plan:`.

## Dependencies

- **Setup → Foundational → US1 (the MVP) → US2 → US3.** These are the P1 core. US2 and US3 need `notify()` (T009) and the panel (T016).
- **US4** needs US1's panel.
- **US5** needs `follow()` (T009).
- **US6** needs the pulse (T014).
- **US7** needs `notify()` and the scheduler. Its scheduler (T036) is reused by US12.
- **US10** can start after T007 and T008. T038 (the stored locale) is needed by US11 and US12.
- **US11** needs T038 and the settings defaults (T008). It plugs into `afterCommit` (T009).
- **US8** shows what US11 and US12 deliver, so its table is finished after them. The settings actions (T045) can land earlier.
- **US9** needs `listNotifications` filters (T013).
- **US12** needs the scheduler (T036), the locale (T038) and settings (T045).
- **The Inbox phase** comes after US1, so the bell exists before the Inbox loses its Mentions tab.
- **Polish** comes last.

## Parallel examples

- **Setup:** T002 (the lab) and T003 (the dependency) beside T001 (design).
- **Foundational:** T005, T006, T007 and T008 touch different files. T009 follows T004, T005 and T008.
- **After US1:**
  - US2 (`tasks.ts` creation and move paths, the brief editor);
  - US5 (Modal header, backfill);
  - US10 (`LangToggle`, profile);
  - US11 (worker, `push.ts`, `PushOffer`).

  These can proceed side by side. Edits to `src/actions/tasks.ts` (T011, T012, T020, T021, T022, T025) run one after another.

## Implementation strategy

1. **MVP = Setup, Foundational and US1.** Comments and replies notify the right people, the bell updates live, and a click opens the comment. Show it to the user.
2. **Then US2 and US3** complete the P1 core: moves, new tasks, assignments, mentions and grouping.
3. **Then the P2 stories:** US4 list management, US5 follow, US6 toasts, US7 due dates, US10 language and US11 phone alerts.
4. **Then the P3 stories:** US8 settings, US9 history and US12 email.
5. **The Inbox phase,** then validation, docs, and the PR.

Each story ends with green lab checks.
