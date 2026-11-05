# Validation: Board Inbox

**Date**: 2026-11-05 · **Branch**: `claude/nice-noether-x4rgei`

## 1. Lab: `npm run lab:inbox`

**Node checks (11/11):**
- `pure-counts-equal-rows` (SC-002);
- `pure-reviews-by-role` (SC-003);
- `pure-your-tasks`;
- `pure-snooze`;
- `pure-mentions-window` (SC-007);
- `pure-team`;
- `pure-done`;
- `pure-summary`;
- `pure-date-words`;
- `tokens-only`;
- `messages-parity`.

**Browser scenarios (38/38):**

| Group | Scenarios |
|---|---|
| US1 | us1-1…us1-6, us1-ring, us1-reduced |
| US2 | us2-1…us2-5 |
| US3 | us3-1…us3-4, us3-denied |
| US4 | us4-1…us4-5 |
| US5 | us5-1…us5-3 |
| US6 | us6-1, us6-2 |
| US7 | us7-1…us7-5 |
| Polish | inbox-kbd, inbox-rtl, inbox-phone, inbox-axe, inbox-perf (open and close well under 500 ms, SC-008) |

Fixed while validating:
- **Phone:** the panel no longer slides in at phone width, where it is full screen.
- **Accessible name:** the button's name now starts with its visible words, then the counts in words (axe `label-content-name-mismatch`).
- **Contrast:** the faint text colour was darkened to `#6E727C` (4.8:1).
- **Focus ring:** the tab focus ring is drawn inside the tab, so it isn't clipped.

## 2. Regressions

- `npm run typecheck`: clean.
- `bash scripts/preflight.sh`: clean.
- `next build`: passes.
  - A first attempt failed with "next/font/google queries have exactly one entry", from a stale Turbopack cache after a failed font download.
  - `rm -rf .next` fixed it. No code change.
- `lab:sheet`: 109/109.
  - `kbd-only` was flaky: Enter was pressed before the status menu had focus. The scenario now waits for the menu, and passed 4 of 4.
- `lab:attachments`: 60/60. `us3-1` failed once on timing, then passed 3 of 3.
- `lab:brief`: 55/55.

## 3. Running app (quickstart §2)

**Setup:**
- local PostgreSQL, `next build` and `next start`, signed in as the Marketing Manager (admin);
- three of her tasks made late, due today and undated;
- two fresh mentions and one 20 days old;
- a teammate's comment on her work.

**Result: 34/34 passed.**

| Check | Result |
|---|---|
| No "for you" cards above the pipeline; bell removed | PASS |
| Pipeline on the first screen at 1366×768 (SC-001) | PASS: column top at 355 px |
| Button purple and filled | PASS |
| Number = reviews + your tasks + unread mentions (SC-002) | PASS: 24 = 2 + 20 + 2 |
| Every C-Review and Final check task is waiting for her (SC-003) | PASS: 2 of 2 |
| 20-day-old mention starts read (SC-007) | PASS |
| Approve moves the task on; celebration plays; number drops (SC-004, SC-005) | PASS |
| Closing the celebration with Esc leaves the Inbox open | PASS. Fixed during this run: the panel now ignores Esc and outside clicks while a modal is open |
| Send back returns one stage; the note is a comment naming the owner | PASS |
| Tomorrow stored, still put off after a reload; Bring back | PASS |
| Set date saved | PASS |
| Mark read stored; read on a second session (SC-006) | PASS |
| Reply in place: a comment naming the author, and the mention read | PASS |
| Team lists a teammate's comment, not her own reply; opens at that comment | PASS |
| Done shows the all-time total | PASS |
| Pin stored; still pinned after a reload; a board click leaves it open; unpin closes | PASS |
| Show your week stored and shown; Columns before design hides 4 columns | PASS |
| Arabic: panel opens from the left | PASS |
| No page errors | PASS |

## 4. Not checked here

- **SC-009 and SC-010:** whether people understand the number and find the button. These need the team after launch.
- **Arabic strings:** need a native review.
