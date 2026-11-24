# Validation: Sidebar and brand pages (spec 025)

Run on the branch `claude/wonderful-dirac-k1wflu`, 24 Nov 2026, against the local lab
database and dev server.

## The request's checks (§5)

| # | Check | Covered by | Result |
|---|---|---|---|
| 1 | Clicking Content shows tasks from every brand; Content › Forefront shows only Forefront's Content tasks | `025-space-and-brand-folder-show-the-same-task` | Pass |
| 2 | The same task appears in the Space, the Space › Brand folder and the Brand page, and an edit in one shows in all three | `025-space-and-brand-folder-show-the-same-task` (stage changed in the folder; seen on the brand page's Board in the To Do column) | Pass |
| 3 | The sidebar fits on screen without scrolling | `025-sidebar-structure-and-counts` (1400 × 950, Content open with its four folders) | Pass |

## The rest of the request

| Part | Covered by | Result |
|---|---|---|
| §1 Sections My work / Spaces / Brands; "Teams" renamed; a folder per brand; the arrow doesn't navigate; no rows under a brand; short names; open · overdue with overdue in red | `025-sidebar-structure-and-counts`, `mytasks-sidebar-sections-tiles` | Pass |
| §2 Views Board · Sheet · Calendar; brand filter; Group by brand; the Space's own stage names; last view remembered per Space and per folder | `us1-space-lists-shows-in`, `025-space-and-brand-folder-show-the-same-task`, `024-video-board-shows-its-range-only`, `views-home-pin-hide` | Pass |
| §3 Brand: three sections; original stage names; Sheet has a Space column; Calendar is the publishing calendar | `025-brand-page-sections`, `us2-brand-folders`, `us1-brand-page` | Pass |
| §3 Assets: columns; upload by button and by dragging; preview; type; linked task; search, type filter, sort; delete | `025-brand-page-sections` | Pass |
| §3 Settings: admins only; C-Check, fields switched off, default priority | `025-brand-page-sections`, `025-brand-settings-admins-only`, `us4-*`, `023-brand-switches-a-field-off` | Pass |

## Regression

- Real-app scenarios: 110. First run 101 passed and 9 failed. All 9 were tests that used a control
  this spec moves, and each passes after being pointed at its new place:
  - the brand's switches are in its Settings section (3 tests);
  - List and Workload are views of the brand's page, not of a Space (4 tests);
  - the My tasks count is in the sidebar's My work section (1 test);
  - a Space has no Workload tab to pin (1 test).
- The List view's grouping buttons now show on the brand page too (they were Space-only).

## Not done here, or to confirm

- **Library.** Its sidebar row is gone and nothing was deleted; the page still opens at
  `/brands/<id>/library`. The request says to confirm before removing it.
- **My sheets** left the sidebar with this restructure; `/sheets` still opens by address until
  spec 026 replaces the Sheets section.
- **Arabic** for the new strings was written here and hasn't been reviewed by a native speaker.
- **Phone**: the More sheet uses the same tree; it wasn't checked on a phone-sized screen here.
- **File storage**: uploads were checked without a bucket (files kept in the database). The bucket
  path uses the same storage code as task attachments but wasn't run here.
