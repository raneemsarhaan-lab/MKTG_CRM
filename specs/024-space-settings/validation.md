# Validation: Space settings (spec 024)

Run on the branch `claude/wonderful-dirac-k1wflu`, 24 Nov 2026, against the local lab
database and dev server.

## The request's checks (§10)

| # | Check | Covered by | Result |
|---|---|---|---|
| 1 | A clip added to a video starts at Ready For Design on the Video board and is never blocked by Caption or TOV | `024-clip-starts-at-ready-for-design` | Pass |
| 2 | A Content task needs Caption before C-Review; the same work in the Video Space isn't asked again | `024-content-asks-caption-video-does-not`, `pure-space-settings` | Pass |
| 3 | Hiding TOV in the Design Space hides it there only; it still shows in Content | `024-hide-tov-in-design-only` | Pass |
| 4 | Changing the "New task label" changes the add button and the sheet's add row | `024-new-task-label-and-flow` | Pass |
| 5 | Existing clips at To Do are now at Ready For Design; clips past To Do stay | `024-existing-todo-clips-move` | Pass (see note 1) |

Also checked: the Video board shows Ready For Design to D-Check only, with its own stage
names (`024-video-board-shows-its-range-only`); a flow that doesn't hold together is refused
with the reason (`024-new-task-label-and-flow`); a member without admin or superuser rights
sees no Settings button (`024-user-cannot-change-settings`).

## Regression

- Real-app scenarios: 106. First run 97 passed and 9 failed; all 9 were tests written for the
  behaviour this spec changes, and each passes after being updated:
  - the add button now carries the Space's label ("New post", not "Add task"): 4 tests;
  - the stage editor opens from Settings › Flow: 2 tests;
  - the Video Space opens on its default view (Sheet), and lists only its range: 1 test;
  - a designer may no longer unlink (the Space names who can): 1 test, now checks the refusal
    and that a content creator can;
  - the home view: a real fault found here and fixed (see note 2).
- Pure checks: 31 pass, including `pure-space-settings`.

## Notes

1. The lab database had no clips at To Do, so the one-time move changed nothing when the seed
   ran. The check creates a clip at To Do and one at C-In Progress and runs the same function.
   On the real database it runs once, on the next deploy's seed.
2. With a Space opening on its Board, the board's own change to the address sent the page back
   from the member's home view. The page now follows `?view=` only when it changes, and opens
   on the home view (then the last view used) straight away, from data sent with the page.

## Not done here

- **Default sheet columns**: applied with spec 026. The setting lists the columns of the Space's
  sheet of rows, and decides which show until someone shows or hides a column on that sheet.
- **Arabic** for the new strings was written here and hasn't been reviewed by a native speaker.
- **The link and unlink buttons** still show for people who may not use them; pressing one
  explains why it was refused.
