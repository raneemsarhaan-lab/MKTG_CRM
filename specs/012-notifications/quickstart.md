# Quickstart: Validating Task Notifications

## 1. Pure checks (Node, no database)

```bash
npm run lab:notify
```

This builds `scripts/notify-lab/` and runs:

- **Recipients.** Every kind × role combination in data-model §5:
  - the actor is never included;
  - one entry per person;
  - muted followers are dropped, except for mentions and assignments;
  - the stage holders match `holdsStage`.
- **Grouping.** Within 2 hours a group grows; after it is read, or after 2 hours, a new one starts. Mentions are never grouped. Two simultaneous events give an exact count.
- **Sentences.** English and Arabic for every kind, with counts 1, 2, 3, 11 and 100. Arabic with and without gender.
- **Settings.** The defaults, and "off in the app" switching off everywhere.
- **Due reminders.** "Due tomorrow" and "overdue" in Cairo time around midnight, sent once per due date.
- **UI scenarios** (Playwright, stub host):
  - the bell and its 9+;
  - the panel's tabs, infinite scroll, ⋯ menu, Mark all and empty state;
  - toasts: 5 s, none for the open task, none in DND, "and N more";
  - the settings table;
  - the phone layout;
  - Arabic;
  - keyboard;
  - axe.

## 2. Regressions

```bash
npm run lab:inbox
```

The Inbox panel shows only To do and Done; its Mentions and Team scenarios moved to `lab:notify`.

```bash
npm run lab:header
```

The bell is now in the top bar; the phone top bar still fits, with the first column at 320 px or less.

```bash
npm run lab:sheet
```

```bash
npm run lab:attachments
```

```bash
npm run lab:brief
```

The brief lab also covers the `@` picker in the description.

```bash
npm run typecheck
```

```bash
bash scripts/preflight.sh
```

```bash
npx next build
```

## 3. Running app: two members, local PostgreSQL

Start `next dev` with `NOTIFY_SCHEDULER=1`, then sign in as an admin and as the Content Creator.

| # | Check | Expected |
|---|---|---|
| 1 | A comments on a task B is assigned to | B's bell goes up within 10 s, and A's doesn't. Clicking it opens the comment, highlighted, and the count goes down |
| 2 | B is the assignee and the creator | One notification |
| 3 | Five comments by 3 people within an hour | One grouped row: "X, Y and 3 others commented…" |
| 4 | Move a task into Content review | Every Marketing Manager is notified once, and the mover isn't |
| 5 | Assign, and @mention in a description | Each sends one notification. The mention reaches a non-follower |
| 6 | Reply to a comment | The parent's author and the other repliers are notified |
| 7 | Turn off notifications for a task, then comment | Nothing, except a mention |
| 8 | Task due tomorrow; run the tick twice | One "due tomorrow" |
| 9 | Settings: Attachments off in the app | No attachment notifications |
| 10 | Arabic | Sentences in Arabic, right to left, with correct plurals |
| 11 | Delete a task with notifications, then click one | "This task is no longer available" |
| 12 | Inbox | Only To do and Done. Its count excludes mentions |

## 4. Phone alerts (a real phone against a deployed preview)

1. **Keys.** Generate VAPID keys once: `npx web-push generate-vapid-keys`. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT=mailto:…`.
2. **Android Chrome.**
   1. Open the bell and tap "Get alerts on this phone", then allow.
   2. Close the app.
   3. From another member, mention this one.
   4. Expected: an alert within 1 minute, and tapping it opens the comment.
3. **iPhone (iOS 16.4 or later).**
   1. In Safari, the offer shows the Home Screen steps.
   2. Add Momentum to the Home Screen and open it from there.
   3. Allow alerts, then repeat the mention test.
4. **No double alerts.** With the app open and in use, a toast shows and no alert.
5. **Sign-out.** Sign out on the phone, then mention: no alert.

## 5. Email (with Resend configured)

1. **Set-up.** Set `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender domain). Settings must no longer say "Email isn't set up yet".
2. **Instant.** Mentions on for email, mode Instant.
   - A mention left unread for 10 minutes sends one email.
   - A mention read within 10 minutes sends none.
3. **Daily summary.** At 08:30 Cairo (or by calling the tick route), one email lists what's unread. When nothing is unread, nothing is sent.
4. **Arabic.** The email reads right to left, and its links open the exact target after sign-in.

Record every result in `validation.md`.
