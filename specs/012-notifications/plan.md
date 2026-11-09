# Implementation Plan: Task Notifications

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `012-notifications`) | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/012-notifications/spec.md`, clarified on 2026-11-08:
- **Option A:** a bell beside the Inbox. The bell holds what happened; the Inbox keeps what you need to act on.
- **One-level comment replies**, built now.
- **Phone alerts and email in this build**, chosen per kind and per channel in settings.

Planning note from the user: "notification system".

## Summary

A Facebook-style bell with a red count sits beside the spec 006 Inbox. Nine kinds of events become notifications:
- comment;
- reply;
- attachment;
- new task in your stage;
- moved to your stage;
- assigned;
- mention;
- due tomorrow;
- overdue.

They go to the right people, at most once per person per event, never to the person who acted, and grouped within 2 hours. Clicking one opens the exact comment, attachment or task. New ones show as toasts while you work, as phone alerts while Momentum is closed, and by email when chosen. Everything reads in English or Arabic.

The approach (details in [research.md](./research.md)):

- **One `notify()` (R1).** It is called inside each action's transaction. It:
  1. resolves recipients with pure functions;
  2. reuses the app's `holdsStage` rule for "stage owner" (R2);
  3. drops the actor, duplicates and muted followers;
  4. applies settings;
  5. groups under an advisory lock (R5);
  6. pushes after commit.
- **Reused entities.**
  - Comments gain `parent_id` for replies (R4).
  - Tasks gain `description_mentions` (R11).
  - Members gain `locale`, `gender`, DND, email mode and last-active.
  - New tables: `notifications`, `task_followers` (with "muted"), `notification_settings`, `push_subscriptions`, `due_reminders`, `email_digests` ([data-model.md](./data-model.md)).
- **Facts, not sentences (R6).** Sentences are built at display time with next-intl ICU messages. Push and email render on the server in the member's stored locale (R13).
- **Live updates by a light poll (R7).** It runs every 8 s while visible. A socket would need infrastructure this deployment doesn't have.
- **Phone alerts by Web Push (R8).** The worker handles only push: no fetch handler, no caching. This keeps the app's no-caching rule.
- **Timed jobs (R9).** An in-process scheduler, guarded by an advisory lock, runs the due reminders, the instant emails, the 08:30 daily summary and the 90-day clean-up.
- **Email (R10).** Resend's HTTP API, with no new dependency.
- **The Inbox (R12).** It keeps To do and Done. Its Mentions and Team tabs move to the bell, and the last 7 days of unread mentions carry over.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router, on Node 22.

**Primary Dependencies**: Existing: next-intl, Prisma v5, Tiptap (`@tiptap/suggestion`), and the board's `TaskModal`, `BoardHeader` and Inbox components. **One new: `web-push`**, for VAPID signing and payload encryption (see Complexity Tracking).

**Storage**: PostgreSQL via `db push`. Six new tables, and new columns on `task_comments`, `tasks` and `members`. Everything is additive (data-model).

**Testing**:
- a new `npm run lab:notify`:
  - Node checks of recipients, grouping, messages, settings and due-date logic;
  - Playwright scenarios for the bell, panel, toasts, settings, replies and the follow toggle, with a stub host;
- regressions: `lab:inbox` (updated for option A), `lab:header`, `lab:sheet`, `lab:attachments`, `lab:brief`;
- `typecheck`, `preflight`, `next build`;
- running-app checks with two members on local PostgreSQL;
- phone and email checks against a deployed preview (quickstart §4–§5).

**Target Platform**:
- desktop and phone browsers, in English and Arabic;
- phone alerts on Android Chrome, on iOS 16.4 or later from the Home Screen, and on desktop browsers;
- deployed on Cranl (one long-lived `next start`).

**Project Type**: Web application (single Next.js project).

**Performance Goals**:
- **Bell:** the count updates within 10 s (SC-001).
- **List:** opens within 1 s with 1,000 rows (SC-008). The pulse query is an index scan.
- **Actions:** `notify()` adds under 30 ms to an action for typical recipient counts (≤ 15).
- **Phone alerts:** within 1 minute (SC-009).

**Constraints**:
- **Never notify the actor, at most one per person per event** (FR-003, FR-004).
- **Nothing on the device that caches pages or data** (FR-094).
- **A failed push or email never fails the action** (FR-098).
- **Token colours only, strings in both languages** (§I, §V).

**Scale/Scope**:
- about 10 members, about 400 tasks, and tens to hundreds of events a day;
- 6 tables, about 12 server actions and routes, and about 9 components;
- changes to about 15 existing actions, the Inbox, `TaskModal`, the description editor, `BoardHeader`, the middleware and the backfill.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Gate | Status |
|---|---|---|
| **I. Design System Fidelity** | Tokens only. | **Pass, with a task.** New `--nt-*` variables mirror the red badge, the unread tint and the blue dot from the option A preview, added to `src/lib/tokens.ts` as `NOTIFY_UI`. |
| **II. Workflow Pipeline Integrity** | No stage or SLA change. | **Pass.** Notifications read stages and moves. "Stage owner" reuses `holdsStage`. Due reminders read due dates, and don't change SLAs. |
| **III. Role-Based Feature Access** | Gates in the UI and on the server. | **Pass.** Every action and route acts only for the signed-in member, on their own notifications, follows, settings and devices. Replies follow the existing comment rule (any member who can see the task). No new edit rights. |
| **IV. Design-Driven Development** | A design file before the UI. | **Pass, with a task.** `design/notifications.html` covers the bell panel, rows, the ⋯ menu, toasts, the settings table, the follow toggle, replies, the phone-alerts offer, the phone layout and Arabic. It builds on the approved `design/notifications-options.html` (option A). |
| **V. Cultural UX** | Arabic, plus celebrations. | **Pass.** A `notifications` namespace in both files, with ICU plurals and gender select. Members get an optional gender for Arabic verb agreement, with a neutral phrasing when it isn't set. Push and email render in each member's locale. Celebrations are untouched. |
| **VI. State Architecture** | No new persisted store state; unions in the types first. | **Pass.** `NotificationKind`, `NotificationChannel` and `EmailMode` go in `src/types/index.ts` first. The pulse state lives in a hook, and settings live in the database. Nothing goes in Zustand `persist`. |
| **Tech Stack** | A new major dependency needs an amendment. | **Justified below.** `web-push` is a single-purpose library, not a framework change. It is recorded in Complexity Tracking for sign-off. (The constitution's stack table still says Supabase and Vercel. The app has been on Prisma and Cranl since before spec 005, and that drift is noted, not changed here.) |

## Project Structure

### Documentation (this feature)

```text
specs/012-notifications/
├── spec.md · plan.md · research.md (R1–R14) · data-model.md · quickstart.md
├── contracts/server.md · contracts/ui.md
└── checklists/requirements.md
design/notifications-options.html   # the approved option A comparison
design/notifications.html           # the full design (task)
```

### Source Code (repository root)

```text
prisma/schema.prisma                       # + 6 tables; task_comments.parent_id; tasks.description_mentions; members.locale/gender/notify_dnd/email_mode/last_active_at
src/types/index.ts                         # + NotificationKind, NotificationChannel, EmailMode, AppNotification
src/lib/tokens.ts                          # + NOTIFY_UI
src/lib/notify/
├── recipients.ts      # pure: resolveRecipients(event, task, followers, members) (R1, R2)
├── group.ts           # pure: groupKey(), shouldJoin(open, event, now) (R5)
├── message.ts         # pure: messageFor(notification, actors) → { key, values } (R6)
├── settings.ts        # pure: DEFAULTS, effective(member, kind, channel) (FR-041)
├── days.ts            # pure: teamDay(), dueState(task, now) in NOTIFY_TZ (R9)
├── notify.ts          # server: notify(db, event), followTask(), pushAfterCommit() (R1, R3, R8)
├── push.ts            # server: web-push send, prune expired (R8)
├── email.ts           # server: Resend sender + EN/AR templates (R10)
└── scheduler.ts       # server: startNotifyScheduler(), jobs (R9)
src/instrumentation.ts                     # register(): start the scheduler on the Node runtime
src/actions/notifications.ts               # contracts/server.md actions
src/actions/tasks.ts, content.ts, inbox.ts, projects.ts   # call notify(); addComment parentId; updateTask description_mentions
src/app/api/notifications/{pulse,push,push/key,tick}/route.ts
src/app/api/attachments/route.ts           # notify on upload
src/app/(app)/notifications/page.tsx       # full history (FR-035)
src/app/(app)/notifications/settings/page.tsx
src/components/notifications/
├── NotificationBell.tsx · NotificationPanel.tsx · NotificationRow.tsx
├── NotificationToasts.tsx · usePulse.ts · PushOffer.tsx
├── NotificationSettings.tsx · NotificationsPage.tsx
src/components/board/BoardHeader.tsx       # (unchanged API) the bell is passed in the inbox slot
src/components/kanban/KanbanBoard.tsx      # bell + toasts + deep-link params (comment, section, n)
src/components/kanban/TaskModal.tsx        # Follow toggle; replies; initialSection; comment flash
src/components/kanban/brief-editor/extensions.ts   # @ mention suggestion (R11)
src/components/inbox/*, src/lib/inbox.ts   # Mentions/Team tabs removed; counts = to do (R12)
src/components/shared/LangToggle.tsx       # also calls setLocale (R13)
src/middleware.ts                          # allow /push-sw.js
public/push-sw.js                          # push + notificationclick only, no fetch handler
scripts/backfill.sh                        # seed followers; carry over 7 days of unread mentions
scripts/notify-lab/                        # NEW lab: pure checks + UI scenarios
messages/en.json, messages/ar.json         # + notifications.*
```

**Structure Decision**: These are the existing Next.js `src/` folders. The notification logic lives in `src/lib/notify/`, split into pure modules (checked in Node by the lab) and server modules. The UI gets its own `src/components/notifications/`. Existing actions gain one `notify()` call each, inside their transactions.

## Phase 0 → Phase 1

- [research.md](./research.md): R1–R14, with no open questions. The email provider (Resend) is confirmed at deployment, and the code isolates it in one file.
- [data-model.md](./data-model.md): the tables, columns, indexes, defaults, the recipients table and the launch steps.
- [contracts/server.md](./contracts/server.md): the actions, routes, changes to existing actions, and errors.
- [contracts/ui.md](./contracts/ui.md): the bell, panel, toasts, task panel changes, page, settings, the Inbox after option A, and access.
- [quickstart.md](./quickstart.md): the lab, regressions, running-app checks, phone and email.

## Constitution Check (post-design)

- **No new edit rights** (§III).
- **Tokens and translated strings only.**
- **No new persisted client state.**
- **One justified dependency.** **Still passing**, with `web-push` recorded below.
- **Design gate.** `design/notifications.html` must be published before UI tasks start (§IV).

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| New dependency `web-push` | Web Push needs VAPID JWT signing and aes128gcm payload encryption (RFC 8291) for every alert. FR-090 to FR-093 and SC-009 depend on it. | Hand-writing the encryption with node `crypto` is about 200 lines of security-sensitive code. Firebase Cloud Messaging adds a Google account and SDK for what the open standard already covers. |
| An in-process scheduler | Due reminders, instant emails, the daily summary and clean-up need a clock. | No cron is confirmed on Cranl. The process runs continuously there, and an advisory lock makes it safe with more than one instance. A secret-guarded tick route is kept as a fallback trigger. |
| Polling, not a socket | Live counts within 10 s. | Server-Sent Events and WebSockets depend on proxy behaviour or a separate server that this deployment doesn't have. Polling is cheap at this team's size. |
