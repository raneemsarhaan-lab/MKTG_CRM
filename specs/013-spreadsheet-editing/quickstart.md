# Quickstart: validating Spreadsheet Editing and Sheet Tabs

How to prove spec 013 works, from the pure modules to the running app. Details are in [contracts/](./contracts/) and [data-model.md](./data-model.md).

## 0. Prerequisites

- Local PostgreSQL with the app's database, the schema applied (`bash scripts/migrate.sh`), and the backfill run (`bash scripts/backfill.sh`, which runs `scripts/sheets-backfill.ts`).
- Two members who can sign in: an admin, and a `user` (for example the Content Creator).
- `npm install` done. No new dependency.

## 1. The lab (no database)

```bash
npm run lab:spreadsheet
```

**Node checks of the pure modules:**
- **Clipboard** (`src/lib/sheet-clipboard.ts`):
  - parse Excel and Google Sheets HTML;
  - parse TSV with quoted line breaks and tabs;
  - serialise back, with a round trip giving identical cells;
  - a single value fills a block.
- **Selection:** range maths, Shift-extend, Ctrl+arrow to the edge of the data, row and column selection.
- **Undo and redo:** inverse change sets for edits, pastes, clears, cuts, row and column inserts and deletes, and resizes; 100 steps; a new edit clears redo.
- **Positions:** midpoints, and renumbering when the gap runs out.
- **Tab names:** next free "Sheet N"; "(2)" on a clash; forbidden characters; 50-character cut.
- **Tab rules:** the last visible sheet can't be deleted or hidden; linked sheets refuse delete, rename, hide, protect and move-out.

**Browser scenarios** (stub server, real `GridCore`, `BlankSheet`, `Workbook`, `TabBar`, `SheetsHome`):

| # | Scenario | Expected |
|---|---|---|
| 1 | Click a cell, type, Enter | Saved, moves down; the outbox records one change |
| 2 | Double-click inside text | Caret at the click; Alt+Enter adds a line; Esc restores |
| 3 | Arrows, Tab, Shift+Tab, Ctrl+arrow, Home and End | Selection moves as described, mirrored in Arabic |
| 4 | Drag A1→C3, Shift+click E5 | A1:E5 selected, "25 cells selected" |
| 5 | Paste Excel HTML (5 × 3) at B2 | B2:D6 filled; the selection is the pasted block |
| 6 | Paste TSV with a quoted line break | The line break stays inside the cell |
| 7 | Copy B2:D6 | The clipboard holds TSV and an HTML table equal to the cells |
| 8 | Cut A1:A3, paste at C1 | C1:C3 filled, A1:A3 empty, one undo step |
| 9 | Select a block, Delete | All cleared, one undo step |
| 10 | Undo ×3, Redo ×3 | The exact earlier and later states |
| 11 | Insert 2 rows above row 3, delete column C | Cells shift; undo restores the same ids |
| 12 | Drag row 5 taller, column A wider | Sizes saved; text wraps |
| 13 | "+" twice | "Sheet 2" and "Sheet 3", the last one opens |
| 14 | Every item in Excel's tab menu | Each works, and disables with its reason where it should |
| 15 | Drag and Ctrl+drag a tab | Reordered; copied |
| 16 | Select All Sheets → Tab Color → Hide | Grouped actions; the last visible sheet stays |
| 17 | The save status offline | "Not saved, retrying"; recovers; leaving asks first |
| 18 | Sheets home | Linked folders first; New folder; pin and unpin; delete with Undo |
| 19 | 5,000 × 26 sheet | Moves and tab switches under 100 ms |
| 20 | Phone (390 px) and Arabic | Tap, double-tap, long-press, the tab bar above the nav, mirrored |
| 21 | axe | No serious or critical issues on the home page, the workbook, the menus or the dialogs |

**Regressions:** `lab:sheet` (the linked sheets on the grown `GridCore`, plus new range, paste-into-cells and undo scenarios), `lab:header`, `lab:inbox`, `lab:notify`, `lab:brief`, `lab:attachments`.

## 2. Static checks and build

```bash
npm run typecheck
```

```bash
bash scripts/preflight.sh
```

```bash
npx next build
```

## 3. The running app (two members, local PostgreSQL, a production build)

| # | Check | Expected |
|---|---|---|
| 1 | Sidebar → Sheets | The home page: Content and Video (🔗) first; both pinned under Sheets |
| 2 | New folder "Campaign planning" | Opens with "Sheet 1" (100 × 26) |
| 3 | Type in A1, reload | Kept. Another member sees it after reloading |
| 4 | Copy a 1,000 × 20 range from Google Sheets, paste at A1 | Every value in place, under 3 s; still there after a reload |
| 5 | Copy back to Google Sheets | The same rows, columns and line breaks |
| 6 | Tab menu: rename, colour, Move or Copy (copy, to the front), protect, hide, unhide, delete the copy | Each kept after a reload; protection blocks the other member |
| 7 | Sheets › Content: paste 5 titles over 5 pieces | Renamed on the board. A `user` pasting over others' pieces gets "you can't edit 5 tasks" |
| 8 | Content: paste "Content Review" into Status | Moves the piece by the board's rule, with a celebration where due |
| 9 | Content: type into a team column on someone else's piece as a `user` | Saved (FR-060) |
| 10 | Video: delete 2 clip rows, undo | Dropped, then restored |
| 11 | Board → Content tab | The same sheet and edits as Sheets › Content |
| 12 | Two members edit different cells of one blank sheet at once, then reload | Both edits kept |
| 13 | Delete a team folder, Undo within 10 s; delete again | Comes back; then gone after 10 s |

## 4. Sign-off

Record results in `specs/013-spreadsheet-editing/validation.md`.
