# Quickstart: validating the Board Inbox

## 1. Lab (no database)

Run:

```bash
npm run lab:inbox
```

What it does:
- **Build:** `scripts/inbox-lab/build.sh` bundles a page that mounts the real `InboxButton`, `InboxPanel` and `ViewMenu` with a stub host and fixtures.
  - The fixtures are members Raneem (Marketing Manager, admin), Yosra (Brand Director), Mona (Managing Director), Lina (Video Editor) and Sara (Content Creator).
  - The tasks cover every review stage, late, due today, undated, published this week and earlier, with comments and mentions.
- **Node checks:** `pure.mjs` checks `src/lib/inbox.ts`:
  - counts equal the listed rows (SC-002);
  - every review-stage task for a role appears (SC-003);
  - the 7-day window (SC-007);
  - summary order;
  - date words;
  - the next midnight.
- **Browser checks:** `scenarios.mjs` runs Playwright scenarios, one or more per story, plus keyboard, right-to-left, phone and axe.

Expected: every check passes.

## 2. Running app (local PostgreSQL)

1. Run `bash scripts/migrate.sh`, then start the dev server.
2. Sign in as the Marketing Manager. Put one task in C-Review and one in Final check. Give the member a late task, a task due today and an undated one. From another member, mention them in a comment.
3. Check that:
   - the Board shows no cards above the pipeline;
   - the Inbox button is purple, shows the right number and the summary line, and pulses.
4. Open it:
   - To do lists both reviews first, then the three tasks;
   - Approve moves the task on the board and the number drops (SC-004, SC-005).
5. Send back with a note: the task returns one stage, and the note appears as a comment that mentions the owner.
6. Tomorrow: the row leaves, and the "Put off" line appears. Reload: it is still put off.
7. Mentions:
   - reply in place, and Mark read;
   - reload on a second browser profile: still read (SC-006).
8. Team lists another member's comment, but not your own upload. Done lists this week's published tasks and the total.
9. Pin:
   - the panel sits beside the board;
   - a board click leaves it open;
   - reload: still pinned.
10. View menu:
    - Show your week brings back Week Momentum and Daily Spark;
    - Columns before design hides the upstream columns.
11. Switch to Arabic: the panel opens from the left, mirrored.

Record the results in `validation.md`.
