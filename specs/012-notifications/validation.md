# Validation record: Task Notifications

**Date**: 2026-11-08 · **Branch**: `claude/nice-noether-x4rgei`

How spec 012 was checked, and what wasn't yet.

## 1. Static checks and build

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `bash scripts/preflight.sh` | Pass |
| `next build` (production) | Pass. New routes: `/notifications`, `/notifications/settings`, `/api/notifications/{pulse,push,push/key,tick}` |
| Schema | Applied locally with `scripts/migrate.sh` (data-model §1–§2) |

## 2. Labs

| Lab | Result |
|---|---|
| `npm run lab:notify` (new) | **46/46**: 11 Node checks, 35 browser scenarios |
| `npm run lab:inbox` | **9 Node checks, 30 scenarios**, all pass. Updated for To do and Done: the Mentions and Team checks moved to `lab:notify` |
| `npm run lab:header` | **24/24**. The bell is now in the top bar; `h5-top` checks it fits at 390 px beside the Inbox, one row, 44 px targets; `h6-tab-order` includes it |
| `npm run lab:brief` | **55/55** (the brief editor gained `@`) |
| `npm run lab:sheet` | **150/150** (`cus1-5` failed once, passed on rerun) |
| `npm run lab:attachments` | **59/60**. `us3-2` (focus after Undo) is flaky: it fails and passes on the commit before this work too |

**`lab:notify`** mounts the real `NotifyProvider`, bell, panel, toasts, settings, history and `ReplyComposer` with a stub server that pages by cursor like the real action.

- **Node:** recipients for every kind and role; grouping (join, expiry, read starts a new group, mentions never join); settings defaults and precedence; EN and AR sentences with counts and gender; `teamDay` around midnight in Cairo; who a brief names (`mentionedIn`); the text of phone alerts and emails in both languages (escaped HTML, right-to-left Arabic email, links to the comment or Attachments); EN/AR key parity.
- **US1:** the count and "9+"; hidden at zero; every row's sentence, snippet, time, tint and dot; Today / Earlier; opening at the comment or at Attachments; "This task is no longer available"; Esc, outside click and the bell close it, focus back on the bell; the reply composer's `@` list and mentions.
- **US3:** grouped sentences ("Salma, Yosra and 2 others…", "Salma and Omar…", "added 5 attachments"); two stacked avatars.
- **US4:** 56 rows across three pages with no repeats; the Unread tab keeps a row marked read in place until reopened; Mark as unread brings the dot back; Mark all and the empty state; turning a task off; the keyboard (↑↓, Enter, Shift+F10, Esc).
- **US6:** a toast for something new, never on the first look, never twice, gone after 5 s, paused while hovered, "and 2 more"; none with DND, none for the open task.
- **US8:** the defaults; "In the app" off turns the row off; email mode, DND, gender and language saved; the note when email isn't set up; a refused save rolls back and says so.
- **US9:** filters by kind and date, clear, rows open their task.
- **US10:** Arabic sentences (feminine, masculine, neutral, dual), Arabic time, the panel on the left.
- **US11:** the offer asks permission only after a tap, saves the device and goes away; Not now; iPhone Home Screen steps; unsupported, blocked and on/off in settings.
- **Phone and access:** the panel takes the screen at 390 px with a close button; axe (serious and critical) clean on the bell, the panel (EN, AR, with a menu open), settings and history.

## 3. Running app (quickstart §3)

Local PostgreSQL and a production build (`next build && next start`), with `NOTIFY_SCHEDULER=0` and `NOTIFY_TICK_SECRET`. Two members signed in at once: Raneem (admin, Marketing Manager) and the Content Creator. Script: `scripts/notify-lab/realapp/run.cjs`. **36/36 pass, twice in a row, no page or console errors.**

| # | Check | Result |
|---|---|---|
| 1 | A comments on B's task | B's bell went up in 7.3 s; A's stayed at 0. Clicking opened the task at the comment, highlighted; the count went down |
| 2 | B is assignee, owner and creator | One notification |
| 3 | Five comments by three people | One row, count 5, three people: "Graphic Designer, Content Creator and 1 other commented…" |
| 4 | Move into C-Review from the task panel | The Marketing Manager told once; the mover not told |
| 5 | Follow, and `@` in a description | Follow / Following works both ways. Typing `@Vid` in the brief offered Video Editor; saving told them once, and they now follow |
| 6 | Reply to a comment | The reply shows under the comment; its author is told "Raneem replied to your comment on …" |
| 7 | Turn off a task, then comment | Nothing; a mention still came through |
| 8 | Due tomorrow, the due job twice | One "due tomorrow" (first run through `/api/notifications/tick`) |
| 9 | Attachments off in the app | Saved as one changed row; no attachment notification |
| 10 | Arabic | "أشارت إليك Content Creator في …", right to left; the stored language followed the cookie |
| 11 | A deleted task's notification | "This task is no longer available" |
| 12 | Inbox | To do and Done only |
| — | Toast while working | "Video Editor commented on …" with the snippet |
| — | History | The Mentions filter shows only mentions |

**Bugs found here and fixed:**
- Replies were saved but not shown: the comment mapper dropped `parent_id` (`src/lib/mappers.ts`).
- Opening a notification about a comment newer than the page didn't show or highlight it. The Board now fetches the board again until the comment is there (`KanbanBoard`), and the task panel waits up to 10 s for it.

**Note.** Under `next dev`, a hot reload can reload the page in the middle of opening a task, which loses the highlight. That's the dev server only; the production build passes every time.

## 4. Phone alerts and email (quickstart §4–§5)

**Not yet checked.** They need a deployed preview with keys:

1. Phone alerts: run `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a `mailto:` address) on Cranl.
2. Email: a Resend account with a verified sender; set `RESEND_API_KEY` and `EMAIL_FROM`.
3. Set `APP_URL` (or `NEXTAUTH_URL`) so links in alerts and emails point at the app.

Then follow quickstart §4 (Android, and an iPhone from the Home Screen) and §5 (instant and daily email).
